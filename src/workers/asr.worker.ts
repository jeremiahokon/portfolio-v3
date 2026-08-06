/// <reference lib="webworker" />

import {
  type AutomaticSpeechRecognitionPipeline,
  pipeline,
} from '@huggingface/transformers';

import {
  assertDtypeApplied,
  configureEnv,
  selectBackend,
  toDownloadProgress,
} from '@/lib/models/loader';
import type { AsrSegment, ErrorCode } from '@/lib/subtitles/types';

import { type FromWorker, isToWorker, type ToWorker } from './protocol';

/**
 * Whisper host.
 *
 * Owns one pipeline for the worker's lifetime and reuses it across chunks —
 * building a session per chunk would re-upload weights to the GPU every time
 * and is the usual cause of memory growth across a long job.
 *
 * Whisper produces the words and punctuation. Its segment timestamps are ~1 s
 * granular, so they are only ever used to bound alignment windows or, before
 * the aligner is downloaded, as deliberately-labelled estimated timings.
 */

let asr: AutomaticSpeechRecognitionPipeline | null = null;
/** The job this worker is currently serving. Messages for any other are dropped. */
let currentJob: string | null = null;
let cancelled = false;

function post(message: FromWorker): void {
  self.postMessage(message);
}

function fail(jobId: string, code: ErrorCode, err: unknown): void {
  post({
    t: 'error',
    jobId,
    stage: 'asr',
    code,
    message: err instanceof Error ? err.message : String(err),
  });
}

async function init(message: Extract<ToWorker, { t: 'init' }>): Promise<void> {
  currentJob = message.jobId;
  cancelled = false;

  configureEnv({ host: message.host, cacheKey: message.cacheKey });

  const backend = message.model.device ?? (await selectBackend());
  const loadedFiles: string[] = [];

  try {
    asr = await pipeline('automatic-speech-recognition', message.model.id, {
      revision: message.model.revision,
      dtype: message.model.dtype as never,
      device: backend,
      progress_callback: (info) => {
        if (cancelled) return;
        // Record which weight files actually resolved, so the dtype the
        // manifest promised can be checked against what was fetched.
        if (
          (info.status === 'download' || info.status === 'progress') &&
          'file' in info &&
          typeof info.file === 'string' &&
          info.file.endsWith('.onnx') &&
          !loadedFiles.includes(info.file)
        ) {
          loadedFiles.push(info.file);
        }

        const progress = toDownloadProgress(info);
        if (progress) {
          post({
            t: 'download',
            jobId: message.jobId,
            file: progress.file,
            loaded: progress.loaded,
            total: progress.total,
          });
        }
      },
    });
  } catch (err) {
    fail(message.jobId, 'model-download-failed', err);

    return;
  }

  assertDtypeApplied(
    message.model.dtype as Record<string, string>,
    loadedFiles
  );

  post({ t: 'ready', jobId: message.jobId, backend });
}

async function transcribe(
  message: Extract<ToWorker, { t: 'asr' }>
): Promise<void> {
  if (!asr) {
    fail(message.jobId, 'unknown', new Error('ASR pipeline not initialised'));

    return;
  }

  // `pcm` arrived as a transferred ArrayBuffer, so this view costs no copy.
  const samples = new Float32Array(message.pcm);

  if (process.env.NODE_ENV === 'development') {
    // Now that the pipeline no longer chunks for us, a window longer than
    // Whisper's receptive field is truncated *silently* — audio would vanish
    // with no error. `planChunks` caps windows at 30 s, so this can only fire if
    // that guarantee is broken, which is exactly when it needs to be loud.
    const field = 30 * message.sampleRate;
    if (samples.length > field) {
      console.error(
        `[asr] window is ${(samples.length / message.sampleRate).toFixed(1)}s, over Whisper's 30s field — audio past 30s will be dropped`
      );
    }
  }

  if (process.env.NODE_ENV === 'development') {
    // Kept deliberately: a silent or mis-scaled buffer and a broken model dtype
    // both present as a nonsense transcript, and these three numbers separate
    // the two in one glance. Diagnosing the fp16-encoder failure without them
    // meant guessing.
    let sum = 0;
    let peak = 0;
    for (const value of samples) {
      sum += value * value;
      peak = Math.max(peak, Math.abs(value));
    }
    console.warn(
      `[asr] samples=${samples.length} seconds=${(samples.length / message.sampleRate).toFixed(2)} rms=${Math.sqrt(sum / samples.length).toFixed(4)} peak=${peak.toFixed(4)}`
    );
  }

  try {
    const output = await asr(samples, {
      // Word-level timestamps would need the aligner; chunk-level is all
      // Whisper can honestly provide and all this stage claims.
      return_timestamps: true,
      // No `chunk_length_s` / `stride_length_s`. `planChunks` already cut this
      // audio into ≤30 s windows on silence boundaries (`chunk-plan.ts:37`), and
      // passing them here made the pipeline re-chunk each window and apply its
      // own stride merge *underneath* our seam dedupe in `stitch.ts`. Two
      // independent overlap-resolution schemes stacked on one another is the
      // likeliest source of the 136 residual duplicate cues measured on the
      // 39-minute fixture. The option defaults to 0, meaning no chunking, which
      // is the native Whisper path for an input already inside its 30 s field.
      //
      // Reduces the chance of a degenerate repetition loop: the loop re-emits a
      // token sequence it has already produced, and this makes each repeat
      // progressively less likely. Kept mild — this processor penalises *every*
      // previously-seen token, so a large value would start suppressing the
      // ordinary recurrence of common words and flatten real speech. It is a
      // probabilistic reduction, not a guarantee, which is why
      // `collapseDegenerateRuns` bounds the damage deterministically downstream.
      //
      // `no_repeat_ngram_size` was considered and rejected: it is a hard ban on
      // any repeated n-gram, so it cannot distinguish 86 spurious repeats from
      // someone genuinely saying "thank you" twice. Both parameters are verified
      // present and wired in transformers.js 4.2.0
      // (`models/modeling_utils.js:420-426`).
      repetition_penalty: 1.1,
    });

    if (cancelled || message.jobId !== currentJob) return;

    const segments = extractSegments(output, message.offset);

    post({
      t: 'asr:done',
      jobId: message.jobId,
      chunkId: message.chunkId,
      segments,
    });
  } catch (err) {
    if (cancelled) return;
    // A GPU OOM surfaces as an opaque device-lost error; naming it lets the UI
    // suggest a shorter clip instead of showing "unknown error".
    const text = err instanceof Error ? err.message : String(err);
    const code = /out of memory|device lost|allocation/i.test(text)
      ? 'out-of-memory'
      : 'unknown';
    fail(message.jobId, code, err);
  }
}

/**
 * Pulls `{ text, start, end }` triples out of the pipeline's output.
 *
 * The pipeline returns chunks whose `timestamp` is a `[start, end]` pair, and
 * the final chunk's end is sometimes `null` when Whisper never emitted a closing
 * timestamp token. That is filled from the audio duration by the caller, so it
 * is left as the segment start here rather than invented.
 */
export function extractSegments(output: unknown, offset: number): AsrSegment[] {
  const chunks = (
    output as { chunks?: Array<{ text?: string; timestamp?: unknown }> }
  )?.chunks;
  if (!Array.isArray(chunks)) return [];

  const segments: AsrSegment[] = [];

  for (const chunk of chunks) {
    const pair = chunk.timestamp;
    if (!Array.isArray(pair)) continue;
    const [start, end] = pair as [number | null, number | null];
    if (typeof start !== 'number') continue;
    const text = (chunk.text ?? '').trim();
    if (!text) continue;

    segments.push({
      text,
      start: start + offset,
      end: (typeof end === 'number' ? end : start) + offset,
    });
  }

  return segments;
}

self.addEventListener('message', (event: MessageEvent<unknown>) => {
  const message = event.data;
  if (!isToWorker(message)) return;

  // A cancelled job's in-flight messages must not touch the next job's state.
  if (message.t === 'cancel') {
    if (message.jobId === currentJob) cancelled = true;

    return;
  }
  if (
    currentJob !== null &&
    message.jobId !== currentJob &&
    message.t !== 'init'
  ) {
    return;
  }

  switch (message.t) {
    case 'init':
      void init(message);
      break;
    case 'asr':
      void transcribe(message);
      break;
    default:
      break;
  }
});
