import { beforeEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_FIND,
  findMatches,
  replaceAll,
} from './find-replace';
import { resetRetextIds } from './retext';
import type { Cue, Word } from './types';

function word(text: string, start: number, end: number): Word {
  return {
    id: `w${start}`,
    text,
    origText: text,
    start,
    end,
    conf: 0.9,
    edited: false,
    timeLocked: false,
  };
}

/**
 * A transcript shaped like the real one: the same wrong term repeated across
 * several cues, which is the case the feature exists for.
 */
function fixture(): { words: Word[]; cues: Cue[] } {
  const texts = [
    'the',
    'arrc',
    'number',
    'is',
    'an',
    'arrc,',
    'thing',
    'and',
    'ARRC',
    'again',
  ];
  const words = texts.map((t, i) => word(t, i, i + 1));
  const cues: Cue[] = [
    { id: 'c1', wordStart: 0, wordEnd: 2, lineBreaks: [] },
    { id: 'c2', wordStart: 3, wordEnd: 6, lineBreaks: [] },
    { id: 'c3', wordStart: 7, wordEnd: 9, lineBreaks: [] },
  ];

  return { words, cues };
}

const render = (words: Word[]) => words.map((w) => w.text).join(' ');

beforeEach(resetRetextIds);

describe('findMatches', () => {
  it('finds every occurrence across cues, case-insensitively', () => {
    const { words, cues } = fixture();

    const matches = findMatches(words, cues, 'arrc');

    expect(matches).toHaveLength(3);
    expect(matches.map((m) => m.from)).toEqual([1, 5, 8]);
  });

  it('ignores surrounding punctuation in whole-word mode', () => {
    const { words, cues } = fixture();

    // "arrc," at index 5 must match the query "arrc".
    expect(findMatches(words, cues, 'arrc').some((m) => m.from === 5)).toBe(true);
  });

  it('respects case sensitivity', () => {
    const { words, cues } = fixture();

    const matches = findMatches(words, cues, 'ARRC', {
      ...DEFAULT_FIND,
      caseSensitive: true,
    });

    expect(matches.map((m) => m.from)).toEqual([8]);
  });

  it('matches substrings when whole-word is off', () => {
    const { words, cues } = fixture();

    const whole = findMatches(words, cues, 'rr', DEFAULT_FIND);
    const partial = findMatches(words, cues, 'rr', {
      ...DEFAULT_FIND,
      wholeWord: false,
    });

    expect(whole).toHaveLength(0);
    expect(partial).toHaveLength(3);
  });

  it('finds multi-word phrases', () => {
    const { words, cues } = fixture();

    const matches = findMatches(words, cues, 'arrc number');

    expect(matches).toEqual([{ cueIndex: 0, from: 1, to: 2 }]);
  });

  it('never matches across a cue boundary', () => {
    const { words, cues } = fixture();

    // "thing and" spans cue 2 into cue 3, so it must not match.
    expect(findMatches(words, cues, 'thing and')).toEqual([]);
  });

  it('returns nothing for an empty query', () => {
    const { words, cues } = fixture();

    expect(findMatches(words, cues, '   ')).toEqual([]);
  });

  it('does not return overlapping matches', () => {
    const words = ['a', 'a', 'a', 'a'].map((t, i) => word(t, i, i + 1));
    const cues: Cue[] = [{ id: 'c', wordStart: 0, wordEnd: 3, lineBreaks: [] }];

    // "a a" could match at 0, 1 and 2; overlapping hits would be replaced twice.
    expect(findMatches(words, cues, 'a a').map((m) => m.from)).toEqual([0, 2]);
  });
});

describe('replaceAll', () => {
  it('replaces every occurrence in one action', () => {
    const { words, cues } = fixture();

    const out = replaceAll(words, cues, findMatches(words, cues, 'arrc'), 'ARC');

    expect(out.replaced).toBe(3);
    expect(render(out.words)).toBe(
      'the ARC number is an ARC, thing and ARC again'
    );
  });

  it('keeps the punctuation around a replaced word', () => {
    const { words, cues } = fixture();

    const out = replaceAll(words, cues, findMatches(words, cues, 'arrc'), 'ARC');

    // "arrc," became "ARC," — not "ARC".
    expect(out.words[5]!.text).toBe('ARC,');
  });

  it('leaves untouched words’ timings byte-identical', () => {
    const { words, cues } = fixture();

    const out = replaceAll(words, cues, findMatches(words, cues, 'arrc'), 'ARC');

    for (const index of [0, 2, 3, 4, 6, 7, 9]) {
      expect(out.words[index]!.start).toBe(words[index]!.start);
      expect(out.words[index]!.end).toBe(words[index]!.end);
    }
  });

  it('preserves the timing of the replaced words too, when the count is unchanged', () => {
    const { words, cues } = fixture();

    const out = replaceAll(words, cues, findMatches(words, cues, 'arrc'), 'ARC');

    // One word for one word is a substitution, so the span still describes the
    // audio it always described.
    expect(out.words[1]!.start).toBe(words[1]!.start);
    expect(out.words[1]!.end).toBe(words[1]!.end);
    expect(out.words[1]!.edited).toBe(true);
  });

  it('reindexes correctly when the replacement adds words', () => {
    const { words, cues } = fixture();

    const out = replaceAll(
      words,
      cues,
      findMatches(words, cues, 'arrc'),
      'Airlines Reporting Corporation'
    );

    expect(out.replaced).toBe(3);
    expect(out.words).toHaveLength(10 + 3 * 2);

    // Every cue still covers a contiguous range and they tile the word list.
    let expected = 0;
    for (const cue of out.cues) {
      expect(cue.wordStart).toBe(expected);
      expected = cue.wordEnd + 1;
    }
    expect(expected).toBe(out.words.length);
  });

  it('reindexes correctly when the replacement removes words', () => {
    const { words, cues } = fixture();

    const out = replaceAll(
      words,
      cues,
      findMatches(words, cues, 'arrc number'),
      'ARC'
    );

    expect(out.words).toHaveLength(9);
    expect(render(out.words)).toBe('the ARC is an arrc, thing and ARRC again');

    let expected = 0;
    for (const cue of out.cues) {
      expect(cue.wordStart).toBe(expected);
      expected = cue.wordEnd + 1;
    }
    expect(expected).toBe(out.words.length);
  });

  it('handles several matches inside one cue', () => {
    const words = ['x', 'arrc', 'and', 'arrc', 'y'].map((t, i) =>
      word(t, i, i + 1)
    );
    const cues: Cue[] = [{ id: 'c', wordStart: 0, wordEnd: 4, lineBreaks: [] }];

    const out = replaceAll(words, cues, findMatches(words, cues, 'arrc'), 'ARC');

    expect(out.replaced).toBe(2);
    expect(render(out.words)).toBe('x ARC and ARC y');
  });

  it('returns the inputs unchanged when there is nothing to replace', () => {
    const { words, cues } = fixture();

    const out = replaceAll(words, cues, [], 'ARC');

    expect(out.words).toBe(words);
    expect(out.cues).toBe(cues);
    expect(out.replaced).toBe(0);
  });

  it('is idempotent — replacing the result again finds nothing', () => {
    const { words, cues } = fixture();

    const once = replaceAll(
      words,
      cues,
      findMatches(words, cues, 'arrc'),
      'ARC'
    );
    const again = findMatches(once.words, once.cues, 'arrc');

    // "ARC" is not "arrc", so a second pass has no work — the operation converged.
    expect(again).toHaveLength(0);
  });
});
