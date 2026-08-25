'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react';

import {
  getEngine,
  subscribeEngine,
  terminateEngine,
} from '@/lib/ffmpeg/engine';
import {
  type DecodedAudio,
  decodeToPcm,
  isEffectivelySilent,
  NoAudioTrackError,
} from '@/lib/media/decode-pcm';
import { describeMp3Failure, extractMp3 } from '@/lib/media/extract-mp3';
import { selectBackend } from '@/lib/models/backend';
import { currentBackendOverride } from '@/lib/models/backend-override';
import { assess, probeDevice } from '@/lib/models/capability';
import {
  ALIGNER,
  ASR,
  CACHE_KEY,
  MODEL_HOST,
  STAGE_ONE_BYTES,
  VAD,
} from '@/lib/models/config';
import { currentDecoderOverride } from '@/lib/models/decoder-override';
import {
  applyAlignment,
  clearRealignmentMarks,
  enforceWordOrder,
  indexAlignments,
  planAlignmentWindows,
  windowsNeedingRealignment,
} from '@/lib/subtitles/apply-alignment';
import {
  clearCheckpoint,
  loadCheckpoint,
  saveCheckpoint,
} from '@/lib/subtitles/checkpoint';
import { planChunks, sliceChunk } from '@/lib/subtitles/chunk-plan';
import {
  buildCues,
  normalizeCues,
  resetIds,
  wordsFromSegments,
} from '@/lib/subtitles/cues';
import {
  collapseDegenerateRuns,
  repairImpossibleSpans,
} from '@/lib/subtitles/degenerate';
import { dropHallucinations, rmsProbe } from '@/lib/subtitles/hallucination';
import {
  clearJobInFlight,
  draftKey,
  markJobInFlight,
} from '@/lib/subtitles/persist';
import { type ChunkResult, stitch } from '@/lib/subtitles/stitch';
import { createJobStore } from '@/lib/subtitles/store';
import type { AlignedWord, Cue, ErrorCode, Word } from '@/lib/subtitles/types';
import { dropSilentRegions } from '@/lib/subtitles/vad-regions';

import type { ToWorker } from '@/workers/protocol';

import { WorkerClient, WorkerError } from './worker-client';

// Owns one transcription job: decode → VAD → chunk plan → ASR per chunk → stitch → cues.
// VAD and ASR run in separate workers (different backends, freed independently).

/** 1 GB, matching the extractor: the mobile-safe ceiling for a WASM tool. */
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
  // Held after a job finishes so the opt-in aligner needs no second decode.
  const decodedRef = useRef<DecodedAudio | null>(null);
  // Kept as the original file (not the 16kHz mono PCM) so MP3 export can re-run without asking again.
  const sourceRef = useRef<File | null>(null);
  const mp3LogRef = useRef<string[]>([]);

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

  // Takes a constructed Worker, not a URL: bundlers only detect `new Worker(new URL(...))` inline at the call site.
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
            message: 'File is too large, the limit is 1 GB.',
          },
        });

        return;
      }

      teardown();
      store.reset();
      resetIds(); // restart the counter so ids stay short and readable per job

      const jobId = `job-${Date.now()}`;
      jobIdRef.current = jobId;
      const controller = new AbortController();
      abortRef.current = controller;
      const isStale = () =>
        controller.signal.aborted || jobIdRef.current !== jobId;

      const fail = (code: ErrorCode, message: string) => {
        if (isStale()) return;
        clearJobInFlight(); // a handled failure is not a crash
        store.set({ status: 'error', error: { code, message } });
        teardown();
      };

      // Read once per job (not per stage) so a mid-job URL change can't switch backends between chunks.
      const override = currentBackendOverride();
      const backend = override ?? (await selectBackend());

      const decoder = currentDecoderOverride(); // `?decoder=int8` etc., for the D17 measurement
      const dtype = decoder
        ? { ...ASR.dtype, decoder_model_merged: decoder }
        : ASR.dtype;

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

      sourceRef.current = file;

      try {
        let decoded;
        try {
          decoded = await decodeToPcm(file, controller.signal);
        } catch (err) {
          if (isStale()) return;
          if (err instanceof NoAudioTrackError) {
            fail('no-audio-track', err.message);

            return;
          }
          console.error('[subtitler] decode failed', err); // surface the real cause; the friendly copy below hides it
          fail(
            'decode-failed',
            'Couldn’t read that file, it may be corrupted or in an unsupported format.'
          );

          return;
        }
        if (isStale()) return;

        // Frees the ffmpeg core/worker now decode is done: matters on Safari, where the model download follows immediately.
        terminateEngine();

        store.set({ duration: decoded.duration });

        // Marker survives a tab kill; its presence after reload tells the UI a job was running.
        markJobInFlight({ fileName: file.name, duration: decoded.duration });

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

        // Copy, not the original buffer: it gets transferred away, and the samples are still needed for ASR.
        const vadPcm = decoded.samples.slice().buffer;
        const vadResult = await vad.request(
          { t: 'vad', jobId, pcm: vadPcm, sampleRate: decoded.sampleRate },
          'vad:done',
          [vadPcm]
        );
        if (isStale()) return;

        vad.terminate(); // free the VAD session before Whisper's weights arrive
        clientsRef.current = clientsRef.current.filter(
          (client) => client !== vad
        );

        // VAD classifies speech but not energy, so it can admit room tone/chime that Whisper
        // hallucinates a word from, must run before the no-speech check, which must read
        // these filtered regions or a silent file falls through to a blind transcription.
        const regions = dropSilentRegions(
          vadResult.regions,
          decoded.samples,
          decoded.sampleRate
        );

        // Checked before the ~151MB ASR download so a silent file costs almost nothing.
        // Both conditions required: no regions alone could be a false negative on real speech.
        if (regions.length === 0 && isEffectivelySilent(decoded.samples)) {
          fail(
            'no-speech',
            'We couldn’t find any speech in this file, it sounds silent.'
          );

          return;
        }

        // Checked before the ~151MB download so an incapable device is told immediately.
        const capability = assess(await probeDevice(decoded.duration));
        if (capability.verdict === 'refuse') {
          fail('unsupported-device', capability.message);

          return;
        }
        store.set({
          notice: capability.verdict === 'warn' ? capability.message : null,
        });

        const chunks = planChunks(regions, decoded.duration);

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
              dtype,
              device: backend, // resolved on the main thread, not hardcoded, see `backend` above
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
          chunkCount: chunks.length,
          chunkIndex: 0,
        });

        // Rejected if window count differs: resuming against a different plan would
        // attribute one window's transcript to another's audio.
        const checkpointKey = draftKey(file, ASR.revision);
        const resumed = await loadCheckpoint(checkpointKey, chunks.length);
        const done0 = new Map(
          (resumed ?? []).map((result) => [result.chunk.id, result])
        );
        if (done0.size > 0) {
          store.set({
            notice: `Resuming: ${done0.size} of ${chunks.length} sections were already transcribed.`,
          });
        }

        // Sequential, not parallel: concurrent requests would queue inside ORT anyway while multiplying peak memory.
        const results: ChunkResult[] = [];
        for (const chunk of chunks) {
          if (isStale()) return;

          const cached = done0.get(chunk.id); // reuse if a previous run already transcribed this chunk
          if (cached) {
            results.push(cached);
            store.set({
              chunkIndex: results.length,
              stage: 'asr',
              stageProgress: results.length / chunks.length,
            });
            continue;
          }

          const slice = sliceChunk(decoded.samples, chunk, decoded.sampleRate);
          const pcm = slice.buffer as ArrayBuffer;
          const request: ToWorker = {
            t: 'asr',
            jobId,
            chunkId: chunk.id,
            pcm,
            sampleRate: decoded.sampleRate,
            offset: chunk.start - chunk.overlapStart, // absolute, so stitching needs no per-chunk offset bookkeeping
          };

          store.set({ chunkIndex: results.length + 1 }); // announced before awaiting, since Whisper reports no progress mid-inference

          const done = await asr.request(request, 'asr:done', [pcm]);
          if (isStale()) return;

          results.push({ chunk, segments: done.segments });
          store.set({
            stage: 'asr',
            stageProgress: results.length / chunks.length,
          });
          await saveCheckpoint(checkpointKey, chunks.length, results); // awaited: a checkpoint racing the next window is worse than a slower loop
        }

        await clearCheckpoint(checkpointKey); // expensive part is banked; a stale resume offer on a finished job would mislead

        asr.terminate();
        clientsRef.current = clientsRef.current.filter(
          (client) => client !== asr
        );

        store.set({ status: 'building', stage: 'cues', stageProgress: 0.5 });

        // Collapsed right after stitching, while the run is still contiguous: a bad decode
        // can emit the same phrase dozens of times in a row.
        const stitched = stitch(results);
        const collapsed = collapseDegenerateRuns(stitched); // collapse repeats before repairing timing, since a repeat is junk to discard
        const real = dropHallucinations(collapsed, {
          rmsAt: rmsProbe(decoded.samples, decoded.sampleRate),
        });
        const segments = repairImpossibleSpans(real);

        if (
          process.env.NODE_ENV === 'development' &&
          collapsed.length !== stitched.length
        ) {
          console.warn(
            `[subtitles] collapsed ${stitched.length - collapsed.length} degenerate repeat segments`
          );
        }

        const words = wordsFromSegments(segments);
        const cues = normalizeCues(words, buildCues(words));

        if (isStale()) return;

        // Reachable when the VAD found regions that turned out not to be speech (music, applause).
        if (words.length === 0) {
          fail(
            'no-speech',
            'We couldn’t make out any speech in this file. If it’s mostly music or background noise, that’s expected.'
          );

          return;
        }

        decodedRef.current = decoded; // retained so the opt-in aligner can run without decoding again; `reset` drops it

        clearJobInFlight();
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

  // Opt-in second stage: replace estimated timings with measured ones (~189MB extra
  // download). Shared by refineTiming/realignEdits: only the windows requested differ.
  const runAligner = useCallback(
    async (mode: 'all' | 'edits') => {
      const decoded = decodedRef.current;
      const snapshot0 = store.getSnapshot();
      if (!decoded || snapshot0.words.length === 0) return;

      const jobId = `align-${Date.now()}`;
      jobIdRef.current = jobId;
      const controller = new AbortController();
      abortRef.current = controller;
      const isStale = () =>
        controller.signal.aborted || jobIdRef.current !== jobId;

      store.set({
        status: 'loading-model',
        stage: 'align',
        stageProgress: 0,
        error: null,
        download: { loaded: 0, total: ALIGNER.approxBytes, files: {} },
      });

      const align = track(
        new Worker(new URL('../../workers/align.worker.ts', import.meta.url)),
        (fileName, loaded) => store.recordDownload(fileName, loaded, 0)
      );

      try {
        const ready = await align.request(
          {
            t: 'init',
            jobId,
            host: MODEL_HOST,
            cacheKey: CACHE_KEY,
            model: {
              id: ALIGNER.id,
              revision: ALIGNER.revision,
              dtype: ALIGNER.dtype,
              ...(currentBackendOverride()
                ? { device: currentBackendOverride()! }
                : {}),
            },
          },
          'ready'
        );
        if (isStale()) return;

        store.set({
          status: 'transcribing',
          stage: 'align',
          backend: ready.backend,
        });

        const words = store.getSnapshot().words;
        const plan =
          mode === 'all'
            ? planAlignmentWindows(words, decoded.duration)
            : windowsNeedingRealignment(words, decoded.duration);

        if (plan.length === 0) {
          // stop rather than rebuild an identical transcript, which would look like something went wrong
          align.terminate();
          clientsRef.current = clientsRef.current.filter((c) => c !== align);
          store.set({
            status: 'done',
            stage: 'done',
            stageProgress: 1,
            notice:
              'Every edit already has measured timing, nothing to re-time.',
          });

          return;
        }
        const results: Array<{ from: number; words: AlignedWord[] }> = [];

        for (const [index, window] of plan.entries()) {
          if (isStale()) return;

          const slice = decoded.samples.slice(
            Math.max(0, Math.floor(window.start * decoded.sampleRate)),
            Math.min(
              decoded.samples.length,
              Math.ceil(window.end * decoded.sampleRate)
            )
          );
          const pcm = slice.buffer as ArrayBuffer;

          const done = await align.request(
            {
              t: 'align',
              jobId,
              chunkId: index,
              pcm,
              sampleRate: decoded.sampleRate,
              offset: window.start,
              tokens: words.slice(window.from, window.to).map((w) => w.text),
            },
            'align:done',
            [pcm]
          );
          if (isStale()) return;

          results.push({ from: window.from, words: done.words });
          store.set({
            stage: 'align',
            stageProgress: (index + 1) / plan.length,
            chunkIndex: index + 1,
            chunkCount: plan.length,
          });
        }

        align.terminate();
        clientsRef.current = clientsRef.current.filter((c) => c !== align);

        const applied = applyAlignment(words, indexAlignments(results));
        const marked = clearRealignmentMarks(applied.words, plan); // clear covered windows' stale markers
        const ordered = enforceWordOrder(marked);

        // Full pass re-derives grouping; partial pass must not, or it discards manual split/merge edits.
        const rebuilt =
          mode === 'all'
            ? normalizeCues(ordered, buildCues(ordered))
            : normalizeCues(ordered, snapshot0.cues);

        if (isStale()) return;

        const measured = ordered.filter((word) => word.conf > 0).length; // conf is only ever written by the aligner

        store.set({
          status: 'done',
          stage: 'done',
          stageProgress: 1,
          words: ordered,
          cues: rebuilt,
          // Counted over the whole transcript, not this pass alone, or a partial re-time reads as data loss.
          timingSource: measured > 0 ? 'aligned' : 'estimated',
          alignedWords: measured,
        });
      } catch (err) {
        if (isStale()) return;
        if (err instanceof WorkerError) {
          // failed refinement must not destroy a good transcript: keep the words, say the upgrade failed
          store.set({
            status: 'done',
            stage: 'done',
            error: {
              code: err.code as ErrorCode,
              message: `Couldn’t improve the timings: ${err.message}. Your transcript is unchanged.`,
            },
          });

          return;
        }
        console.error('[subtitler] alignment failed', err);
        store.set({
          status: 'done',
          stage: 'done',
          error: {
            code: 'unknown',
            message:
              'Couldn’t improve the timings. Your transcript is unchanged.',
          },
        });
      }
    },
    [store, track]
  );

  const cancel = useCallback(() => {
    const jobId = jobIdRef.current;
    if (jobId) {
      // Ask politely first (a cancel message can't interrupt a running frame), then terminate.
      for (const client of clientsRef.current) {
        client.send({ t: 'cancel', jobId });
      }
    }
    clearJobInFlight(); // a deliberate stop is not a crash
    teardown();
    store.reset();
  }, [store, teardown]);

  const busy =
    snapshot.status === 'decoding' ||
    snapshot.status === 'loading-model' ||
    snapshot.status === 'transcribing' ||
    snapshot.status === 'building';

  /** Opt-in full pass: every window, first time the aligner is used. */
  const refineTiming = useCallback(() => runAligner('all'), [runAligner]);

  /** Re-times only what an edit made stale: one forward pass per window, so roughly free next to a full pass. */
  const realignEdits = useCallback(() => runAligner('edits'), [runAligner]);

  // On demand only. Returns null rather than throwing; never touches the transcript.
  const exportMp3 = useCallback(async (): Promise<Blob | null> => {
    const file = sourceRef.current;
    if (!file) return null;

    mp3LogRef.current = [];
    const stop = subscribeEngine({
      onLog: (message) => {
        mp3LogRef.current.push(message);
        if (mp3LogRef.current.length > 40) mp3LogRef.current.shift();
      },
    });

    try {
      const ffmpeg = await getEngine();
      const { blob } = await extractMp3(ffmpeg, file);

      return blob;
    } catch (err) {
      console.error('[subtitler] mp3 export failed', err);
      store.set({ notice: describeMp3Failure(mp3LogRef.current.join('\n')) });

      return null;
    } finally {
      stop();
    }
  }, [store]);

  // Job store must get the result or the export panel keeps serializing the pre-edit transcript.
  const applyEdits = useCallback(
    (words: Word[], cues: Cue[]) => {
      store.set({ words, cues });
    },
    [store]
  );

  return {
    snapshot,
    busy,
    start,
    cancel,
    refineTiming,
    realignEdits,
    exportMp3,
    applyEdits,
    reset: cancel,
  };
}
