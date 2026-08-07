'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react';

import { subscribeEngine } from '@/lib/ffmpeg/engine';
import {
  type DecodedAudio,
  decodeToPcm,
  isEffectivelySilent,
  NoAudioTrackError,
} from '@/lib/media/decode-pcm';
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
import { type ChunkResult, stitch } from '@/lib/subtitles/stitch';
import { createJobStore } from '@/lib/subtitles/store';
import type { AlignedWord, Cue, ErrorCode, Word } from '@/lib/subtitles/types';
import { dropSilentRegions } from '@/lib/subtitles/vad-regions';

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
  // Held after a job finishes so the opt-in aligner needs no second decode.
  const decodedRef = useRef<DecodedAudio | null>(null);

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

      // Read once per job rather than per stage, so a mid-job URL change cannot
      // switch backends between chunks.
      const override = currentBackendOverride();
      // `?decoder=int8` etc., for the D17 measurement. Same read-once discipline:
      // two dtypes inside one transcript would make the result meaningless.
      const decoder = currentDecoderOverride();
      const asrDtype = decoder
        ? { ...ASR.dtype, decoder_model_merged: decoder }
        : ASR.dtype;

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

        // The VAD classifies speech, it does not measure energy, so it admits the
        // occasional region of room tone or a join chime — and Whisper hallucinates
        // a word out of it. On the 39-minute fixture that produced cue #1, "you",
        // over 2 seconds of a silent Zoom waiting room. Screened before chunking,
        // so that audio is never transcribed at all.
        //
        // Must run *before* the no-speech check below, and that check must read
        // these regions rather than the raw ones. Otherwise a file whose only
        // regions are silence passes the check on region count, gets emptied here,
        // and `planChunks` falls back to fixed windows — transcribing the whole
        // silent file blind, which is worse than what this fixes.
        const regions = dropSilentRegions(
          vadResult.regions,
          decoded.samples,
          decoded.sampleRate
        );

        // Nothing to transcribe. Checked here, after the 2 MB VAD but before the
        // ~151 MB ASR download, so a silent file costs almost nothing.
        //
        // Both conditions are required. No regions alone is not enough — a false
        // negative on real speech should fall through to transcribing blind rather
        // than refusing. Silence *and* no regions is conclusive, and stopping here
        // is what prevents Whisper hallucinating a word or two out of noise and
        // the UI presenting that as a transcript.
        if (regions.length === 0 && isEffectivelySilent(decoded.samples)) {
          fail(
            'no-speech',
            'We couldn’t find any speech in this file — it sounds silent.'
          );

          return;
        }

        // Can this device actually finish? Checked here — after decode, so the
        // duration is known, and before the ~151 MB download, so a device that
        // cannot cope is told immediately rather than after several minutes and a
        // tab crash. R4's failure mode is bad mostly because of when it happens.
        const capability = assess(await probeDevice(decoded.duration));
        if (capability.verdict === 'refuse') {
          fail('unsupported-device', capability.message);

          return;
        }
        store.set({
          notice: capability.verdict === 'warn' ? capability.message : null,
        });

        const chunks = planChunks(regions, decoded.duration);

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
              dtype: asrDtype,
              // Omitted unless explicitly overridden, so the worker resolves it
              // by actually requesting a WebGPU adapter. Hardcoding 'webgpu'
              // here would hand a device to browsers that cannot provide one.
              ...(override ? { device: override } : {}),
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

          // Announce the chunk *before* awaiting it, so the UI can say which
          // one is in flight. Whisper reports nothing during inference, so a
          // 30-second window would otherwise look like a stall.
          store.set({ chunkIndex: results.length + 1 });

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

        // A failed decode can emit the same phrase dozens of times over a couple
        // of seconds — 86 consecutive "Thank you." cues on the 39-minute fixture.
        // Collapsed after stitching, where the run is still contiguous, and
        // before words exist, so nothing downstream ever sees the junk.
        const stitched = stitch(results);
        // Collapse first, then repair: a repeated phrase is junk to discard, and
        // only what survives is real speech whose timing is worth fixing.
        const collapsed = collapseDegenerateRuns(stitched);
        // Then drop stock phrases invented from non-speech noise, before the spans
        // are repaired — repairing the timing of a word nobody said would only make
        // the invention more convincing.
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

        // Reachable when the VAD found regions in something that turned out not
        // to be speech — music, room tone, applause. Offering an empty download
        // would be worse than saying so.
        if (words.length === 0) {
          fail(
            'no-speech',
            'We couldn’t make out any speech in this file. If it’s mostly music or background noise, that’s expected.'
          );

          return;
        }

        // Retained so the opt-in aligner can run without decoding again. This is
        // the one place the pipeline deliberately holds onto the full PCM after
        // its stage is over; `reset` drops it.
        decodedRef.current = decoded;

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

  /**
   * The opt-in second stage: replace estimated timings with measured ones.
   *
   * A separate user action rather than part of the job, because it costs another
   * ~189 MB download. Everything before this point produced a usable transcript;
   * this is the upgrade, and it is only worth offering once the user has seen
   * that the words are right.
   */
  /**
   * Runs the aligner over a chosen set of windows.
   *
   * `refineTiming` (whole transcript) and `realignEdits` (M4, just the stale
   * windows) differ only in which windows they ask for and what they say while
   * running. Sharing the body keeps one implementation of the parts that are easy to
   * get wrong — cancellation, worker teardown, and never destroying a good
   * transcript when the upgrade fails.
   */
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

        // Align over the same windows the transcript was built from, so each
        // request carries a bounded number of words and a bounded amount of audio.
        const words = store.getSnapshot().words;
        const plan =
          mode === 'all'
            ? planAlignmentWindows(words, decoded.duration)
            : windowsNeedingRealignment(words, decoded.duration);

        // Nothing stale: say so and stop rather than tearing the transcript down and
        // rebuilding it identically, which would look like something went wrong.
        if (plan.length === 0) {
          align.terminate();
          clientsRef.current = clientsRef.current.filter((c) => c !== align);
          store.set({
            status: 'done',
            stage: 'done',
            stageProgress: 1,
            notice:
              'Every edit already has measured timing — nothing to re-time.',
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
        // Clear the stale markers for the windows this pass covered, or the next run
        // would redo exactly the same work forever.
        const marked = clearRealignmentMarks(applied.words, plan);
        const ordered = enforceWordOrder(marked);

        // A full pass re-derives the grouping, because every timing moved and the
        // old grouping was built from estimates. A partial pass must NOT: rebuilding
        // would throw away every split and merge the user made by hand in order to
        // fix the timing of one phrase. Re-normalising the cues they already have
        // keeps those decisions and still enforces the readability rules.
        const rebuilt =
          mode === 'all'
            ? normalizeCues(ordered, buildCues(ordered))
            : normalizeCues(ordered, snapshot0.cues);

        if (isStale()) return;

        // conf is only ever written by the aligner, so it is the durable record of
        // which words carry a measured timing, however many passes produced them.
        const measured = ordered.filter((word) => word.conf > 0).length;

        store.set({
          status: 'done',
          stage: 'done',
          stageProgress: 1,
          words: ordered,
          cues: rebuilt,
          // Counted over the whole transcript, never from this pass alone.
          // `applied.aligned` is what *this run* measured — right for a full pass and
          // badly wrong for a partial one: re-timing a single edited phrase reported
          // "27 of 160 measured" and looked like it had destroyed the alignment it
          // had in fact preserved.
          timingSource: measured > 0 ? 'aligned' : 'estimated',
          alignedWords: measured,
        });
      } catch (err) {
        if (isStale()) return;
        if (err instanceof WorkerError) {
          // A failed refinement must not destroy a good transcript: keep the words
          // and say the upgrade failed.
          store.set({
            status: 'done',
            stage: 'done',
            error: {
              code: err.code as ErrorCode,
              message: `Couldn’t improve the timings — ${err.message}. Your transcript is unchanged.`,
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

  /**
   * Commits the editor's transcript back into the job.
   *
   * The editor owns its own history while it is open, so the job store has to be
   * told the result or the export panel keeps serialising the transcript as it was
   * *before* editing — which silently hands the user back the file they just spent
   * an hour correcting.
   *
   * `timingSource` is left alone deliberately: an edit does not turn estimated
   * timings into measured ones, and words inserted by `retextCue` carry `conf: 0`
   * so the QC panel already reports them as unmeasured.
   */
  /** The opt-in full pass: every window, first time the aligner is used. */
  const refineTiming = useCallback(() => runAligner('all'), [runAligner]);

  /**
   * M4: re-time only what an edit made stale.
   *
   * The aligner is one forward pass per window, so this is roughly free next to a
   * full pass — the property the two-model split was chosen for. Nothing outside the
   * affected windows is touched, and `timeLocked` words are skipped entirely.
   */
  const realignEdits = useCallback(() => runAligner('edits'), [runAligner]);

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
    applyEdits,
    reset: cancel,
  };
}
