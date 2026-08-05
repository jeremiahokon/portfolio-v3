import type {
  AlignedWord,
  AsrSegment,
  ErrorCode,
  SpeechRegion,
  Stage,
} from '@/lib/subtitles/types';

/**
 * The typed message contract between the main thread and every pipeline worker.
 *
 * Shared by both sides so a protocol change is a type error rather than a
 * silent no-op at runtime. Three rules hold across all workers:
 *
 * 1. Every request carries a `jobId`, and a worker ignores messages whose
 *    `jobId` is not the one it is currently serving. That is what makes a
 *    cancelled job's late-arriving results harmless instead of corrupting the
 *    next job's transcript.
 * 2. Every worker honours `cancel`.
 * 3. PCM moves as a **transferred** `ArrayBuffer`, never a structured-cloned
 *    copy — a 30-minute mono 16 kHz Int16 buffer is ~58 MB and copying it per
 *    stage would be the dominant memory cost.
 */

/** Backend selection, resolved on the main thread and passed in. */
export type Backend = 'webgpu' | 'wasm';

export interface ModelInit {
  /** Model repo id, e.g. `onnx-community/whisper-base`. */
  id: string;
  /** Pinned revision SHA. Never a branch name. */
  revision: string;
  /** Per-file-name dtype map, or a single dtype for all files. */
  dtype: string | Record<string, string>;
  /**
   * Force a backend. **Normally omitted**, and that matters: the worker resolves
   * it by actually asking for a WebGPU adapter, which is the only reliable test.
   * Passing `'webgpu'` unconditionally — as this originally did — means a browser
   * without WebGPU gets handed a device it cannot provide and errors instead of
   * falling back to WASM.
   *
   * Set it only to pin a backend deliberately: the VAD always wants WASM, and a
   * `?backend=` override exists so the slow path can be exercised on a machine
   * that does have a GPU.
   */
  device?: Backend;
}

export type ToWorker =
  | {
      t: 'init';
      jobId: string;
      model: ModelInit;
      cacheKey: string;
      host: string;
    }
  | { t: 'vad'; jobId: string; pcm: ArrayBuffer; sampleRate: number }
  | {
      t: 'asr';
      jobId: string;
      chunkId: number;
      pcm: ArrayBuffer;
      sampleRate: number;
      /** Seconds into the source audio, so returned bounds can be absolute. */
      offset: number;
    }
  | {
      t: 'align';
      jobId: string;
      chunkId: number;
      pcm: ArrayBuffer;
      sampleRate: number;
      offset: number;
      tokens: string[];
    }
  | { t: 'cancel'; jobId: string };

export type FromWorker =
  | { t: 'ready'; jobId: string; backend: Backend }
  | {
      t: 'download';
      jobId: string;
      file: string;
      loaded: number;
      /** Null when the server sends no content-length. */
      total: number | null;
    }
  | { t: 'progress'; jobId: string; stage: Stage; ratio: number }
  | { t: 'vad:done'; jobId: string; regions: SpeechRegion[] }
  | { t: 'asr:done'; jobId: string; chunkId: number; segments: AsrSegment[] }
  | { t: 'align:done'; jobId: string; chunkId: number; words: AlignedWord[] }
  | {
      t: 'error';
      jobId: string;
      stage: Stage;
      code: ErrorCode;
      message: string;
    };

/**
 * Narrows an unknown `MessageEvent.data` to our protocol.
 *
 * Workers receive messages from whoever holds a reference to them, so a shape
 * check beats trusting the cast — a malformed message should be dropped, not
 * crash the worker mid-job.
 */
export function isToWorker(value: unknown): value is ToWorker {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { t?: unknown }).t === 'string' &&
    typeof (value as { jobId?: unknown }).jobId === 'string'
  );
}
