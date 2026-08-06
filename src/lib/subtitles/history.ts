import type { Cue, Word } from './types';

/**
 * Undo history for the editor.
 *
 * Nearly free, and that is a direct consequence of the data model rather than a
 * clever trick: every operation returns new `Word[]` and `Cue[]` arrays and never
 * mutates, so a snapshot is two object references. No diffing library, no
 * structural sharing to reason about, no patch format to keep in step with the
 * operations. Adding an operation cannot break undo, because undo does not know
 * what the operations are.
 *
 * Bounded, because a long editing session over a 39-minute transcript would
 * otherwise retain every intermediate `Word[]` — each around 5,800 objects — for
 * the lifetime of the tab.
 */

export interface TranscriptState {
  words: Word[];
  cues: Cue[];
}

export interface History {
  present: TranscriptState;
  past: TranscriptState[];
  future: TranscriptState[];
}

/** Deep enough for a real editing session, shallow enough to stay cheap. */
export const HISTORY_LIMIT = 50;

export function createHistory(present: TranscriptState): History {
  return { present, past: [], future: [] };
}

/**
 * Records a new state.
 *
 * A no-op operation returns the same array references — every function in
 * `edit.ts` and `retext.ts` is written to do exactly that — so identity is a
 * reliable signal that nothing happened, and pressing a key that changes nothing
 * must not consume an undo step.
 */
export function commit(history: History, next: TranscriptState): History {
  if (
    next.words === history.present.words &&
    next.cues === history.present.cues
  ) {
    return history;
  }

  const past = [...history.past, history.present];

  return {
    present: next,
    past: past.length > HISTORY_LIMIT ? past.slice(-HISTORY_LIMIT) : past,
    // A new edit after undoing abandons the redo branch, which is what every
    // editor does and what users expect.
    future: [],
  };
}

export function undo(history: History): History {
  const previous = history.past.at(-1);
  if (!previous) return history;

  return {
    present: previous,
    past: history.past.slice(0, -1),
    future: [history.present, ...history.future],
  };
}

export function redo(history: History): History {
  const next = history.future[0];
  if (!next) return history;

  return {
    present: next,
    past: [...history.past, history.present],
    future: history.future.slice(1),
  };
}

export const canUndo = (history: History): boolean => history.past.length > 0;
export const canRedo = (history: History): boolean => history.future.length > 0;
