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
} from '@/lib/models/config';
import {
  buildCues,
  normalizeCues,
  wordsFromSegments,
} from '@/lib/subtitles/cues';
import { createJobStore } from '@/lib/subtitles/store';
import type { AsrSegment, ErrorCode } from '@/lib/subtitles/types';

import type { FromWorker, ToWorker } from '@/workers/protocol';

/**
 * Owns one transcription job: decode, model load, ASR, cue building.
 *
 * FFmpeg orchestration stays on the main thread, matching the audio extractor.
 * The FFmpeg WASM already runs in the worker `@ffmpeg/ffmpeg` spawns, so decode
 * is off the main thread either way; only the model work gets our own worker.
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
  // One store per mount. Created lazily so it is never rebuilt on re-render.
  const store = useMemo(() => createJobStore(), []);
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    () => store.getSnapshot()
  );

  const workerRef = useRef<Worker | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const jobIdRef = useRef<string | null>(null);

  // Decode progress comes from the shared engine. Subscribing here rather than
  // inside decodeToPcm keeps the extractor's own handlers untouched.
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
    workerRef.current?.terminate();
    workerRef.current = null;
    jobIdRef.current = null;
  }, []);

  // Terminating on unmount is not optional: a live worker holds a model session
  // and, on the WebGPU path, GPU buffers that would otherwise outlive the page.
  useEffect(() => teardown, [teardown]);

  const fail = useCallback(
    (code: ErrorCode, message: string) => {
      store.set({ status: 'error', error: { code, message } });
      teardown();
    },
    [store, teardown]
  );

  const start = useCallback(
    async (file: File) => {
      if (!isAcceptedFile(file)) {
        fail(
          'decode-failed',
          'That file type isn’t supported. Try MP4, MOV, MKV, WEBM, MP3, WAV or M4A.'
        );

        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        fail('decode-failed', 'File is too large — the limit is 1 GB.');

        return;
      }

      teardown();
      store.reset();

      const jobId = `job-${Date.now()}`;
      jobIdRef.current = jobId;
      const controller = new AbortController();
      abortRef.current = controller;

      store.set({
        status: 'decoding',
        stage: 'decode',
        stageProgress: 0,
        fileName: file.name,
      });

      let decoded;
      try {
        decoded = await decodeToPcm(file, controller.signal);
      } catch (err) {
        if (controller.signal.aborted) return;
        if (err instanceof NoAudioTrackError) {
          fail('no-audio-track', err.message);

          return;
        }
        // Surface the real cause: the friendly copy below hides it, and the
        // equivalent path in the extractor swallowed a cross-origin-isolation
        // failure once already.
        console.error('[subtitler] decode failed', err);
        fail(
          'decode-failed',
          'Couldn’t read that file — it may be corrupted or in an unsupported format.'
        );

        return;
      }

      if (controller.signal.aborted) return;

      store.set({
        duration: decoded.duration,
        status: 'loading-model',
        stage: 'asr',
        stageProgress: 0,
        // Seeded from the manifest so the full size shows before byte one.
        download: { loaded: 0, total: STAGE_ONE_BYTES, files: {} },
      });

      const worker = new Worker(
        new URL('../../workers/asr.worker.ts', import.meta.url)
      );
      workerRef.current = worker;

      const segments: AsrSegment[] = [];

      worker.addEventListener('message', (event: MessageEvent<FromWorker>) => {
        const message = event.data;
        // Ignore anything belonging to a superseded job.
        if (message.jobId !== jobIdRef.current) return;

        switch (message.t) {
          case 'download':
            store.recordDownload(
              message.file,
              message.loaded,
              message.total ?? 0
            );
            break;

          case 'ready': {
            store.set({
              status: 'transcribing',
              backend: message.backend,
              stage: 'asr',
              stageProgress: 0,
            });
            // The whole file goes as one request for first light; VAD-driven
            // chunk planning replaces this, and the pipeline reuses the same
            // message shape when it does.
            const pcm = decoded.samples.buffer as ArrayBuffer;
            const request: ToWorker = {
              t: 'asr',
              jobId,
              chunkId: 0,
              pcm,
              sampleRate: decoded.sampleRate,
              offset: 0,
            };
            worker.postMessage(request, [pcm]);
            break;
          }

          case 'asr:done': {
            segments.push(...message.segments);
            store.set({
              status: 'building',
              stage: 'cues',
              stageProgress: 0.5,
            });

            const words = wordsFromSegments(segments);
            const cues = normalizeCues(words, buildCues(words));

            store.set({
              status: 'done',
              stage: 'done',
              stageProgress: 1,
              words,
              cues,
              timingSource: 'estimated',
            });
            // The session is finished; release the model and its GPU buffers
            // rather than holding them for the page's life.
            worker.terminate();
            workerRef.current = null;
            break;
          }

          case 'error':
            fail(message.code, message.message);
            break;

          default:
            break;
        }
      });

      worker.addEventListener('error', (event) => {
        fail('unknown', event.message || 'The transcription worker crashed.');
      });

      const init: ToWorker = {
        t: 'init',
        jobId,
        host: MODEL_HOST,
        cacheKey: CACHE_KEY,
        model: {
          id: ASR.id,
          revision: ASR.revision,
          dtype: ASR.dtype,
          // Resolved inside the worker, which is where the ORT that actually
          // runs inference lives.
          device: 'webgpu',
        },
      };
      worker.postMessage(init);
    },
    [fail, store, teardown]
  );

  const cancel = useCallback(() => {
    const jobId = jobIdRef.current;
    if (jobId && workerRef.current) {
      const message: ToWorker = { t: 'cancel', jobId };
      workerRef.current.postMessage(message);
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
