import type { Backend } from '@/workers/protocol';

import type { Cue, ErrorCode, Stage, TimingSource, Word } from './types';

/**
 * The job store.
 *
 * Deliberately not `useState` inside a component: a transcription runs for
 * minutes, drives an editor over thousands of words, and must survive a
 * re-render without restarting. Deliberately not a state library either — this
 * repo has consistently avoided one, and a subscribable read through
 * `useSyncExternalStore` is all that is needed.
 *
 * Snapshots are replaced wholesale and never mutated in place, so
 * `useSyncExternalStore` can compare by reference. Word *text* edits will need
 * finer-grained subscriptions once the editor lands; until then the transcript
 * is written once at the end of a job.
 */

export type JobStatus =
  | 'idle'
  | 'decoding'
  | 'loading-model'
  | 'transcribing'
  | 'building'
  | 'done'
  | 'error';

export interface DownloadState {
  /** Bytes fetched so far across every model file. */
  loaded: number;
  /**
   * Expected total. Seeded from the manifest rather than from response headers,
   * so the UI can disclose the full size before the first byte arrives.
   */
  total: number;
  /** Per-file byte counts, keyed by file name. */
  files: Record<string, number>;
}

export interface JobSnapshot {
  status: JobStatus;
  stage: Stage | null;
  /** 0..1 within the current stage. */
  stageProgress: number;
  fileName: string | null;
  /** Seconds of decoded audio, once known. */
  duration: number | null;
  backend: Backend | null;
  /**
   * Which analysis window is in flight, 1-based, and how many there are.
   *
   * Whisper reports nothing during inference, so a ~30 s window would otherwise
   * look like a stall. Counting windows is honest movement; a synthetic
   * percentage inside a window would not be.
   */
  chunkIndex: number;
  chunkCount: number;
  download: DownloadState | null;
  words: Word[];
  cues: Cue[];
  timingSource: TimingSource;
  error: { code: ErrorCode; message: string } | null;
}

export const INITIAL_SNAPSHOT: JobSnapshot = {
  status: 'idle',
  stage: null,
  stageProgress: 0,
  fileName: null,
  duration: null,
  backend: null,
  chunkIndex: 0,
  chunkCount: 0,
  download: null,
  words: [],
  cues: [],
  timingSource: 'estimated',
  error: null,
};

export interface JobStore {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => JobSnapshot;
  set: (patch: Partial<JobSnapshot>) => void;
  reset: () => void;
  /** Records download progress for one file and re-derives the total. */
  recordDownload: (file: string, loaded: number, total: number) => void;
}

export function createJobStore(): JobStore {
  let snapshot: JobSnapshot = INITIAL_SNAPSHOT;
  const listeners = new Set<() => void>();

  function emit(): void {
    for (const listener of listeners) listener();
  }

  function set(patch: Partial<JobSnapshot>): void {
    snapshot = { ...snapshot, ...patch };
    emit();
  }

  return {
    subscribe(listener) {
      listeners.add(listener);

      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    set,
    reset() {
      snapshot = INITIAL_SNAPSHOT;
      emit();
    },
    recordDownload(file, loaded, total) {
      const previous = snapshot.download ?? { loaded: 0, total, files: {} };
      const files = { ...previous.files, [file]: loaded };
      // Sum the per-file counts rather than accumulating deltas: progress events
      // report cumulative bytes per file, so adding them would double-count.
      const summed = Object.values(files).reduce(
        (sum, value) => sum + value,
        0
      );

      set({
        download: {
          files,
          loaded: summed,
          // Never let the bar shrink below what has already been fetched, which
          // can happen when the manifest estimate is lower than reality.
          total: Math.max(previous.total, summed),
        },
      });
    },
  };
}

/** Fraction 0..1 of the model download, or null when nothing is downloading. */
export function downloadRatio(snapshot: JobSnapshot): number | null {
  const download = snapshot.download;
  if (!download || download.total <= 0) return null;

  return Math.min(1, download.loaded / download.total);
}
