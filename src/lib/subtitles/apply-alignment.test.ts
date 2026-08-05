import { describe, expect, it } from 'vitest';

import {
  applyAlignment,
  enforceWordOrder,
  indexAlignments,
} from './apply-alignment';
import type { AlignedWord, Word } from './types';

function word(
  text: string,
  start: number,
  end: number,
  extra: Partial<Word> = {}
): Word {
  return {
    id: text,
    text,
    origText: text,
    start,
    end,
    conf: 0,
    edited: false,
    timeLocked: false,
    ...extra,
  };
}

function aligned(start: number, end: number, conf = 0.9): AlignedWord {
  return { text: '', start, end, conf };
}

describe('applyAlignment', () => {
  const words = [word('one', 0, 1), word('two', 1, 2), word('three', 2, 3)];

  it('replaces timing and confidence for a well-scored word', () => {
    const result = applyAlignment(
      words,
      new Map([[1, aligned(1.2, 1.8, 0.95)]])
    );

    expect(result.words[1]).toMatchObject({
      start: 1.2,
      end: 1.8,
      conf: 0.95,
    });
    expect(result.aligned).toBe(1);
  });

  it('never touches text or origText', () => {
    const result = applyAlignment(
      words,
      new Map([
        [0, { text: 'SOMETHING ELSE', start: 0.1, end: 0.9, conf: 0.9 }],
      ])
    );

    expect(result.words[0]!.text).toBe('one');
    expect(result.words[0]!.origText).toBe('one');
  });

  it('refuses to overwrite a boundary a human locked', () => {
    const locked = [word('one', 0, 1, { timeLocked: true })];
    const result = applyAlignment(locked, new Map([[0, aligned(0.5, 0.7)]]));

    expect(result.words[0]).toMatchObject({ start: 0, end: 1 });
    expect(result.locked).toBe(1);
    expect(result.aligned).toBe(0);
  });

  it('keeps the estimate when the alignment scores below threshold', () => {
    const result = applyAlignment(
      words,
      new Map([[0, aligned(0.4, 0.6, 0.05)]]),
      { minScore: 0.15 }
    );

    expect(result.words[0]).toMatchObject({ start: 0, end: 1 });
    expect(result.kept).toBe(3);
  });

  it('keeps the estimate when the aligned span collapsed', () => {
    const result = applyAlignment(words, new Map([[0, aligned(0.5, 0.5)]]));

    expect(result.words[0]).toMatchObject({ start: 0, end: 1 });
  });

  it('leaves words with no alignment untouched', () => {
    const result = applyAlignment(words, new Map());

    expect(result.words).toEqual(words);
    expect(result.kept).toBe(3);
  });

  it('does not mutate the input', () => {
    const snapshot = words.map((w) => ({ ...w }));
    applyAlignment(words, new Map([[0, aligned(0.1, 0.9)]]));

    expect(words).toEqual(snapshot);
  });
});

describe('enforceWordOrder', () => {
  it('leaves an ordered list alone', () => {
    const words = [word('a', 0, 1), word('b', 1, 2)];

    expect(enforceWordOrder(words)).toEqual(words);
  });

  it('pushes an estimate forward when it collides with the previous word', () => {
    const words = [word('a', 0, 2), word('b', 1, 3)];
    const fixed = enforceWordOrder(words);

    expect(fixed[1]!.start).toBe(2);
  });

  it('pulls an estimate back rather than pushing a measurement forward', () => {
    // The estimate (conf 0) overruns into the measured word (conf 0.9). The
    // measurement is the better number and must not move.
    const words = [
      word('a', 0, 2, { conf: 0 }),
      word('b', 1.5, 3, { conf: 0.9 }),
    ];
    const fixed = enforceWordOrder(words);

    expect(fixed[1]!.start).toBe(1.5);
    expect(fixed[0]!.end).toBe(1.5);
  });

  it('never inverts a word it had to move', () => {
    const words = [word('a', 0, 5), word('b', 1, 2)];
    const fixed = enforceWordOrder(words);

    for (const w of fixed) expect(w.end).toBeGreaterThanOrEqual(w.start);
  });

  it('handles an empty list', () => {
    expect(enforceWordOrder([])).toEqual([]);
  });
});

describe('indexAlignments', () => {
  it('offsets each window’s words by where the window started', () => {
    const map = indexAlignments([
      { from: 0, words: [aligned(0, 1), aligned(1, 2)] },
      { from: 5, words: [aligned(5, 6)] },
    ]);

    expect([...map.keys()]).toEqual([0, 1, 5]);
  });

  it('lets a later window win an overlap', () => {
    // The window that holds a word fully describes it better than one that only
    // saw it as trailing context.
    const map = indexAlignments([
      { from: 0, words: [aligned(0, 1, 0.4)] },
      { from: 0, words: [aligned(0.1, 1.1, 0.95)] },
    ]);

    expect(map.get(0)!.conf).toBe(0.95);
  });

  it('returns an empty map for no results', () => {
    expect(indexAlignments([]).size).toBe(0);
  });
});
