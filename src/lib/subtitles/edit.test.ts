import { describe, expect, it } from 'vitest';

import { buildCues } from './cues';
import {
  cueContaining,
  editWordText,
  lockWord,
  mergeCues,
  moveWordBoundary,
  shiftCue,
  splitCue,
  wordAt,
} from './edit';
import { cueBounds, cueText } from './export';
import type { Cue, Word } from './types';

function word(text: string, start: number, end: number): Word {
  return {
    id: text,
    text,
    origText: text,
    start,
    end,
    conf: 0.9,
    edited: false,
    timeLocked: false,
  };
}

const words: Word[] = [
  word('The', 0, 0.5),
  word('quick', 0.5, 1),
  word('brown', 1, 1.5),
  word('fox', 1.5, 2),
  word('jumps', 2, 2.5),
];

const cue: Cue = { id: 'c1', wordStart: 0, wordEnd: 4, lineBreaks: [3] };

describe('editWordText — the core invariant', () => {
  it('leaves start and end byte-identical, not merely close', () => {
    // This is M3's stated acceptance criterion, and `toBe` rather than
    // `toBeCloseTo` is the point of it.
    const edited = editWordText(words, 2, 'COMPLETELY DIFFERENT AND LONGER');

    expect(edited[2]!.start).toBe(words[2]!.start);
    expect(edited[2]!.end).toBe(words[2]!.end);
  });

  it('marks the word edited so re-alignment knows where to look', () => {
    expect(editWordText(words, 2, 'other')[2]!.edited).toBe(true);
  });

  it('keeps origText so the change stays diffable', () => {
    expect(editWordText(words, 2, 'other')[2]!.origText).toBe('brown');
  });

  it('leaves every other word untouched', () => {
    const edited = editWordText(words, 2, 'other');

    expect(edited.filter((_, i) => i !== 2)).toEqual(
      words.filter((_, i) => i !== 2)
    );
  });

  it('does not mutate the input array', () => {
    const snapshot = words.map((w) => ({ ...w }));
    editWordText(words, 2, 'other');

    expect(words).toEqual(snapshot);
  });

  it('returns the same reference when nothing changed', () => {
    // Cheap identity check keeps React from re-rendering a huge list for nothing.
    expect(editWordText(words, 2, 'brown')).toBe(words);
    expect(editWordText(words, 99, 'x')).toBe(words);
  });
});

describe('lockWord', () => {
  it('marks timing as human-authored', () => {
    expect(lockWord(words, 1)[1]!.timeLocked).toBe(true);
  });

  it('can unlock', () => {
    expect(lockWord(lockWord(words, 1), 1, false)[1]!.timeLocked).toBe(false);
  });

  it('is a no-op when already in that state', () => {
    expect(lockWord(words, 1, false)).toBe(words);
  });
});

describe('moveWordBoundary', () => {
  it('moves an edge and locks the word', () => {
    const moved = moveWordBoundary(words, 2, 'end', 1.3);

    expect(moved[2]!.end).toBe(1.3);
    expect(moved[2]!.timeLocked).toBe(true);
  });

  it('refuses to cross the next word', () => {
    // 3.0 is past where "fox" starts; invalid data, not a preference.
    expect(moveWordBoundary(words, 2, 'end', 3).at(2)!.end).toBe(1.5);
  });

  it('refuses to cross the previous word', () => {
    // "brown" starts at 1.0 and "quick" ends there, so dragging its start back to
    // 0 clamps at 1.0 — the previous word's END, not its start.
    expect(moveWordBoundary(words, 2, 'start', 0).at(2)!.start).toBe(1);
  });

  it('never inverts the word it moves', () => {
    const moved = moveWordBoundary(words, 2, 'end', 0);

    expect(moved[2]!.end).toBeGreaterThanOrEqual(moved[2]!.start);
  });

  it('lets the first word start at zero and the last end anywhere', () => {
    expect(moveWordBoundary(words, 0, 'start', 0).at(0)!.start).toBe(0);
    expect(moveWordBoundary(words, 4, 'end', 99).at(4)!.end).toBe(99);
  });
});

describe('splitCue and mergeCues — losslessness', () => {
  it('split rewrites index ranges only', () => {
    const split = splitCue([cue], 0, 2);

    expect(split).toHaveLength(2);
    expect(split[0]).toMatchObject({ wordStart: 0, wordEnd: 1 });
    expect(split[1]).toMatchObject({ wordStart: 2, wordEnd: 4 });
  });

  it('split never touches a word', () => {
    const snapshot = words.map((w) => ({ ...w }));
    splitCue([cue], 0, 2);

    expect(words).toEqual(snapshot);
  });

  it('split then merge round-trips the covered range', () => {
    const round = mergeCues(splitCue([cue], 0, 2), 0);

    expect(round).toHaveLength(1);
    expect(round[0]).toMatchObject({ wordStart: 0, wordEnd: 4 });
  });

  it('round-trips losslessly through several splits and merges', () => {
    let cues = [cue];
    cues = splitCue(cues, 0, 1);
    cues = splitCue(cues, 1, 3);
    expect(cues).toHaveLength(3);

    cues = mergeCues(cues, 1);
    cues = mergeCues(cues, 0);

    expect(cues).toHaveLength(1);
    expect(cues[0]).toMatchObject({ wordStart: 0, wordEnd: 4 });
    // Every word still rendered exactly once, in order.
    expect(cueText(cues[0]!, words).replace(/\n/g, ' ')).toBe(
      'The quick brown fox jumps'
    );
  });

  it('refuses a split at either edge, which would make an empty cue', () => {
    expect(splitCue([cue], 0, 0)).toHaveLength(1);
    expect(splitCue([cue], 0, 5)).toHaveLength(1);
  });

  it('refuses to merge cues that are not adjacent in word terms', () => {
    // A gap between wordEnd and the next wordStart would swallow the words
    // in between.
    const disjoint: Cue[] = [
      { id: 'a', wordStart: 0, wordEnd: 1, lineBreaks: [] },
      { id: 'b', wordStart: 3, wordEnd: 4, lineBreaks: [] },
    ];

    expect(mergeCues(disjoint, 0)).toBe(disjoint);
  });

  it('refuses to merge the last cue with nothing', () => {
    const only = [cue];

    expect(mergeCues(only, 0)).toBe(only);
  });

  it('keeps the join as a line break when merging', () => {
    const split = splitCue([cue], 0, 2);
    const merged = mergeCues(split, 0);

    expect(merged[0]!.lineBreaks).toContain(2);
  });

  it('drops an override that can no longer describe either half', () => {
    const withOverride: Cue = { ...cue, overrideStart: 0.1, overrideEnd: 9 };
    const split = splitCue([withOverride], 0, 2);

    expect(split[0]!.overrideEnd).toBeUndefined();
    expect(split[1]!.overrideStart).toBeUndefined();
    // The outer edges still describe real boundaries and are kept.
    expect(split[0]!.overrideStart).toBe(0.1);
    expect(split[1]!.overrideEnd).toBe(9);
  });

  it('covers every word exactly once after arbitrary splits', () => {
    let cues = [cue];
    for (const at of [1, 3, 2, 4]) {
      const index = cues.findIndex((c) => at > c.wordStart && at <= c.wordEnd);
      if (index >= 0) cues = splitCue(cues, index, at);
    }

    const covered = cues.flatMap((c) =>
      Array.from(
        { length: c.wordEnd - c.wordStart + 1 },
        (_, k) => c.wordStart + k
      )
    );
    expect(covered.sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('shiftCue', () => {
  it('moves displayed timing without touching words', () => {
    const snapshot = words.map((w) => ({ ...w }));
    const shifted = shiftCue(words, [cue], 0, 0.5);

    expect(cueBounds(shifted[0]!, words)).toEqual({ start: 0.5, end: 3 });
    expect(words).toEqual(snapshot);
  });

  it('never shifts before zero', () => {
    expect(cueBounds(shiftCue(words, [cue], 0, -5)[0]!, words).start).toBe(0);
  });

  it('is a no-op for zero', () => {
    expect(shiftCue(words, [cue], 0, 0)).toEqual([cue]);
  });
});

describe('wordAt', () => {
  it('finds the word being spoken', () => {
    expect(wordAt(words, 1.2)).toBe(2);
  });

  it('is inclusive of the start and exclusive of the end', () => {
    expect(wordAt(words, 1)).toBe(2);
    expect(wordAt(words, 1.5)).toBe(3);
  });

  it('returns -1 outside the transcript', () => {
    expect(wordAt(words, 99)).toBe(-1);
    expect(wordAt([], 1)).toBe(-1);
  });

  it('returns -1 inside a gap between words', () => {
    const gapped = [word('a', 0, 1), word('b', 5, 6)];

    expect(wordAt(gapped, 3)).toBe(-1);
  });

  it('agrees with a linear scan across a large transcript', () => {
    // The binary search exists for performance; this is what proves it is also
    // correct.
    const many = Array.from({ length: 5000 }, (_, i) =>
      word(`w${i}`, i * 0.3, i * 0.3 + 0.25)
    );

    for (const probe of [0, 0.1, 0.28, 100.05, 749.9, 1499.7]) {
      const expected = many.findIndex((w) => probe >= w.start && probe < w.end);
      expect(wordAt(many, probe)).toBe(expected);
    }
  });
});

describe('cueContaining', () => {
  it('finds the cue holding a word', () => {
    const cues = buildCues(words);
    const index = cueContaining(cues, 2);

    expect(cues[index]!.wordStart).toBeLessThanOrEqual(2);
    expect(cues[index]!.wordEnd).toBeGreaterThanOrEqual(2);
  });

  it('returns -1 for a word in no cue', () => {
    expect(cueContaining([cue], 99)).toBe(-1);
  });
});
