import { describe, expect, it } from 'vitest';

import {
  canRedo,
  canUndo,
  commit,
  createHistory,
  HISTORY_LIMIT,
  redo,
  type TranscriptState,
  undo,
} from './history';
import type { Word } from './types';

const state = (text: string): TranscriptState => ({
  words: [
    {
      id: 'w1',
      text,
      origText: 'a',
      start: 0,
      end: 1,
      conf: 1,
      edited: false,
      timeLocked: false,
    } satisfies Word,
  ],
  cues: [{ id: 'c1', wordStart: 0, wordEnd: 0, lineBreaks: [] }],
});

describe('history', () => {
  it('walks backwards and forwards through edits', () => {
    let h = createHistory(state('one'));
    h = commit(h, state('two'));
    h = commit(h, state('three'));

    expect(h.present.words[0]!.text).toBe('three');
    h = undo(h);
    expect(h.present.words[0]!.text).toBe('two');
    h = undo(h);
    expect(h.present.words[0]!.text).toBe('one');
    h = redo(h);
    expect(h.present.words[0]!.text).toBe('two');
  });

  it('ignores a commit that changed nothing', () => {
    const initial = state('one');
    const h = createHistory(initial);

    // Every operation returns the same references on a no-op, so pressing a key
    // that does nothing must not consume an undo step.
    expect(commit(h, initial)).toBe(h);
    expect(canUndo(commit(h, initial))).toBe(false);
  });

  it('abandons the redo branch after a new edit', () => {
    let h = createHistory(state('one'));
    h = commit(h, state('two'));
    h = undo(h);
    h = commit(h, state('different'));

    expect(canRedo(h)).toBe(false);
    expect(h.present.words[0]!.text).toBe('different');
  });

  it('stays bounded over a long session', () => {
    let h = createHistory(state('0'));
    for (let i = 1; i <= HISTORY_LIMIT + 25; i += 1) h = commit(h, state(`${i}`));

    expect(h.past).toHaveLength(HISTORY_LIMIT);
    // The oldest states are gone, the recent ones are intact.
    expect(h.present.words[0]!.text).toBe(`${HISTORY_LIMIT + 25}`);
  });

  it('does nothing at the ends', () => {
    const h = createHistory(state('only'));

    expect(undo(h)).toBe(h);
    expect(redo(h)).toBe(h);
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(false);
  });
});
