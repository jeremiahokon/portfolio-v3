'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react';

import { subscribeEngine } from '@/lib/ffmpeg/engine';
import { decodeToPcm, NoAudioTrackError } from '@/lib/media/decode-pcm';
import {
  ASR,
  CACHE_KEY,
  MODEL_HOST,
  STAGE_ONE_BYTES,
  VAD,
} from '@/lib/models/config';
import { planChunks, sliceChunk } from '@/lib/subtitles/chunk-plan';
import {
  buildCues,
  normalizeCues,
  resetIds,
  wordsFromSegments,
} from '@/lib/subtitles/cues';
import { type ChunkResult, stitch } from '@/lib/subtitles/stitch';
import { createJobStore } from '@/lib/subtitles/store';
import type { ErrorCode } from '@/lib/subtitles/types';

import type { ToWorker } from '@/workers/protocol';

import { WorkerClient, WorkerError } from './worker-client';

/**
 * Owns one transcription job: decode → VAD → chunk plan → ASR per chunk →
 * stitch → cues.
 *
 * FFmpeg orchestration stays on the main thread, matching the audio extractor:
 * its WASM already runs in the worker `@ffmpeg/ffmpeg` spawns, so decode is off
 * the main thread either way, and wrapping it in our own worker would nest one
 * worker inside another and depend on unverified bundler behaviour.
 *
 * The two model workers are separate because they hold separate sessions on
 * separate backends — VAD on WASM, Whisper on WebGPU where available — and
 * because terminating one after its stage frees its memory immediately.
 */

/** 1 GB, matching the extractor — the mobile-safe ceiling for a WASM tool. */
export const MAX_FILE_SIZE = 1024 * 1024 * 1024;

export const ACCEPTED_EXTENSIONS = [
  '.mp4',
  '.mov',
  '.mkv',
  '.avi',
  '.webm',
  '.m4v',
  '.mp3',
  '.wav',
  '.m4a',
  '.aac',
  '.ogg',
  '.flac',
];

function isAcceptedFile(file: File): boolean {
  if (file.type.startsWith('video/') || file.type.startsWith('audio/')) {
    return true;
  }
  const name = file.name.toLowerCase();

  return ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

export function useSubtitler() {
  // One store per mount, created lazily so it survives re-renders.
  const store = useMemo(() => createJobStore(), []);
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    () => store.getSnapshot()
  );

  const clientsRef = useRef<WorkerClient[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const jobIdRef = useRef<string | null>(null);

  // Decode progress comes from the shared engine. Subscribing here rather than
  // inside decodeToPcm leaves the extractor's own handlers untouched.
  useEffect(
    () =>
      subscribeEngine({
        onProgress: (ratio) => {
          if (store.getSnapshot().status === 'decoding') {
            store.set({ stage: 'decode', stageProgress: ratio });
          }
        },
      }),
    [store]
  );

  const teardown = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    for (const client of clientsRef.current) client.terminate();
    clientsRef.current = [];
    jobIdRef.current = null;
  }, []);

  useEffect(() => teardown, [teardown]);

  /**
   * Wraps an already-constructed Worker and tracks it for teardown.
   *
   * Takes the `Worker`, **not** a URL, and that is load-bearing. Bundlers detect
   * `new Worker(new URL('./x.worker.ts', import.meta.url))` by matching the
   * syntax at the call site; passing the URL through a parameter defeats the
   * static analysis, so no worker chunk is emitted and the script silently
   * fails to load. The failure is invisible — an `error` event whose every
   * field, `message` included, is `undefined`. So each `new Worker(new URL(…))`
   * must stay written out inline below.
   */
  const track = useCallback(
    (
      worker: Worker,
      onDownload: (file: string, loaded: number) => void,
      onProgress?: (ratio: number) => void
    ) => {
      const client = new WorkerClient(worker, {
        onDownload,
        ...(onProgress ? { onProgress } : {}),
      });
      clientsRef.current.push(client);

      return client;
    },
    []
  );

  const start = useCallback(
    async (file: File) => {
      if (!isAcceptedFile(file)) {
        store.set({
          status: 'error',
          error: {
            code: 'decode-failed',
            message:
              'That file type isn’t supported. Try MP4, MOV, MKV, WEBM, MP3, WAV or M4A.',
          },
        });

        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        store.set({
          status: 'error',
          error: {
            code: 'decode-failed',
            message: 'File is too large — the limit is 1 GB.',
          },
        });

        return;
      }

      teardown();
      store.reset();
      // Ids are only required to be unique, but restarting the counter keeps
      // them short and readable across jobs.
      resetIds();

      const jobId = `job-${Date.now()}`;
      jobIdRef.current = jobId;
      const controller = new AbortController();
      abortRef.current = controller;
      const isStale = () =>
        controller.signal.aborted || jobIdRef.current !== jobId;

      const fail = (code: ErrorCode, message: string) => {
        if (isStale()) return;
        store.set({ status: 'error', error: { code, message } });
        teardown();
      };

      store.set({
        status: 'decoding',
        stage: 'decode',
        stageProgress: 0,
        fileName: file.name,
        download: { loaded: 0, total: STAGE_ONE_BYTES, files: {} },
      });

      const recordDownload = (fileName: string, loaded: number) => {
        store.recordDownload(fileName, loaded, 0);
      };

      try {
        // ---- Decode -------------------------------------------------------
        let decoded;
        try {
          decoded = await decodeToPcm(file, controller.signal);
        } catch (err) {
          if (isStale()) return;
          if (err instanceof NoAudioTrackError) {
            fail('no-audio-track', err.message);

            return;
          }
          // Surface the real cause: the friendly copy hides it, and the
          // equivalent path in the extractor swallowed a cross-origin-isolation
          // failure once already.
          console.error('[subtitler] decode failed', err);
          fail(
            'decode-failed',
            'Couldn’t read that file — it may be corrupted or in an unsupported format.'
          );

          return;
        }
        if (isStale()) return;

        store.set({ duration: decoded.duration });

        // ---- Voice activity detection --------------------------------------
        store.set({ status: 'loading-model', stage: 'vad', stageProgress: 0 });

        const vad = track(
          new Worker(new URL('../../workers/vad.worker.ts', import.meta.url)),
          recordDownload,
          (ratio) => {
            if (!isStale()) store.set({ stage: 'vad', stageProgress: ratio });
          }
        );

        await vad.request(
          {
            t: 'init',
            jobId,
            host: MODEL_HOST,
            cacheKey: CACHE_KEY,
            model: {
              id: VAD.id,
              revision: VAD.revision,
              dtype: 'fp32',
              device: 'wasm',
            },
          },
          'ready'
        );
        if (isStale()) return;

        store.set({ status: 'transcribing', stage: 'vad', stageProgress: 0 });

        // A copy, because the buffer is transferred away and the samples are
        // still needed afterwards for the ASR chunks.
        const vadPcm = decoded.samples.slice().buffer;
        const vadResult = await vad.request(
          { t: 'vad', jobId, pcm: vadPcm, sampleRate: decoded.sampleRate },
          'vad:done',
          [vadPcm]
        );
        if (isStale()) return;

        // The VAD's session is no longer needed; free it before Whisper's
        // weights arrive rather than holding both.
        vad.terminate();
        clientsRef.current = clientsRef.current.filter(
          (client) => client !== vad
        );

        const chunks = planChunks(vadResult.regions, decoded.duration);

        // ---- Speech recognition -------------------------------------------
        store.set({ status: 'loading-model', stage: 'asr', stageProgress: 0 });

        const asr = track(
          new Worker(new URL('../../workers/asr.worker.ts', import.meta.url)),
          recordDownload
        );

        const ready = await asr.request(
          {
            t: 'init',
            jobId,
            host: MODEL_HOST,
            cacheKey: CACHE_KEY,
            model: {
              id: ASR.id,
              revision: ASR.revision,
              dtype: ASR.dtype,
              device: 'webgpu',
            },
          },
          'ready'
        );
        if (isStale()) return;

        store.set({
          status: 'transcribing',
          stage: 'asr',
          stageProgress: 0,
          backend: ready.backend,
        });

        // Sequential, not parallel: one session on one device, so concurrent
        // requests would queue inside ORT anyway while multiplying peak memory.
        const results: ChunkResult[] = [];
        for (const chunk of chunks) {
          if (isStale()) return;

          const slice = sliceChunk(decoded.samples, chunk, decoded.sampleRate);
          const pcm = slice.buffer as ArrayBuffer;
          const request: ToWorker = {
            t: 'asr',
            jobId,
            chunkId: chunk.id,
            pcm,
            sampleRate: decoded.sampleRate,
            // Bounds come back absolute, so stitching needs no per-chunk offset
            // bookkeeping of its own.
            offset: chunk.start - chunk.overlapStart,
          };

          const done = await asr.request(request, 'asr:done', [pcm]);
          if (isStale()) return;

          results.push({ chunk, segments: done.segments });
          store.set({
            stage: 'asr',
            stageProgress: results.length / chunks.length,
          });
        }

        asr.terminate();
        clientsRef.current = clientsRef.current.filter(
          (client) => client !== asr
        );

        // ---- Stitch and build cues -----------------------------------------
        store.set({ status: 'building', stage: 'cues', stageProgress: 0.5 });

        const segments = stitch(results);
        const words = wordsFromSegments(segments);
        const cues = normalizeCues(words, buildCues(words));

        if (isStale()) return;

        store.set({
          status: 'done',
          stage: 'done',
          stageProgress: 1,
          words,
          cues,
          timingSource: 'estimated',
        });
      } catch (err) {
        if (isStale()) return;
        if (err instanceof WorkerError) {
          fail(err.code as ErrorCode, err.message);

          return;
        }
        console.error('[subtitler] job failed', err);
        fail('unknown', 'Something went wrong while transcribing.');
      }
    },
    [track, store, teardown]
  );

  const cancel = useCallback(() => {
    const jobId = jobIdRef.current;
    if (jobId) {
      // Ask politely first so a worker mid-inference stops looping, then
      // terminate — a cancel message alone cannot interrupt a running frame.
      for (const client of clientsRef.current) {
        client.send({ t: 'cancel', jobId });
      }
    }
    teardown();
    store.reset();
  }, [store, teardown]);

  const busy =
    snapshot.status === 'decoding' ||
    snapshot.status === 'loading-model' ||
    snapshot.status === 'transcribing' ||
    snapshot.status === 'building';

  return { snapshot, busy, start, cancel, reset: cancel };
}
