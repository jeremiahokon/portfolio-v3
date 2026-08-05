import { beforeEach, describe, expect, it } from 'vitest';

import {
  buildCues,
  cueCps,
  normalizeCues,
  resetIds,
  wordsFromSegments,
} from './cues';
import { cueBounds, cueText } from './export';
import { type AsrSegment, DEFAULT_READABILITY as R, type Word } from './types';

beforeEach(() => {
  resetIds();
});

function word(text: string, start: number, end: number): Word {
  return {
    id: text,
    text,
    origText: text,
    start,
    end,
    conf: 0,
    edited: false,
    timeLocked: false,
  };
}

describe('wordsFromSegments', () => {
  const segments: AsrSegment[] = [
    { text: 'a bb cccc', start: 0, end: 7 },
    { text: 'next segment', start: 8, end: 10 },
  ];

  it('distributes duration in proportion to word length', () => {
    const words = wordsFromSegments([segments[0]!]);

    expect(words.map((w) => w.text)).toEqual(['a', 'bb', 'cccc']);
    // 7 chars total over 7 seconds → 1s, 2s, 4s.
    expect(words[0]!.end - words[0]!.start).toBeCloseTo(1);
    expect(words[1]!.end - words[1]!.start).toBeCloseTo(2);
    expect(words[2]!.end - words[2]!.start).toBeCloseTo(4);
  });

  it('lands the last word exactly on the segment end, without drift', () => {
    const words = wordsFromSegments(segments);

    expect(words.at(-1)!.end).toBe(10);
    expect(words[2]!.end).toBe(7);
  });

  it('produces monotonically non-decreasing timings', () => {
    const words = wordsFromSegments(segments);

    for (let i = 1; i < words.length; i += 1) {
      expect(words[i]!.start).toBeGreaterThanOrEqual(words[i - 1]!.start);
      expect(words[i]!.end).toBeGreaterThanOrEqual(words[i]!.start);
    }
  });

  it('marks timings as unscored rather than inventing confidence', () => {
    expect(wordsFromSegments(segments).every((w) => w.conf === 0)).toBe(true);
  });

  it('survives a zero-length segment without collapsing every word', () => {
    const words = wordsFromSegments([{ text: 'one two', start: 5, end: 5 }]);

    expect(words).toHaveLength(2);
    expect(words.every((w) => w.end >= w.start)).toBe(true);
  });

  it('ignores empty and whitespace-only segments', () => {
    expect(wordsFromSegments([{ text: '   ', start: 0, end: 1 }])).toEqual([]);
  });
});

describe('buildCues', () => {
  it('returns nothing for no words', () => {
    expect(buildCues([])).toEqual([]);
  });

  it('breaks at sentence ends even when budget remains', () => {
    const words = [word('Hi.', 0, 1), word('Next', 1, 2), word('one', 2, 3)];
    const cues = buildCues(words);

    expect(cues).toHaveLength(2);
    expect(cueText(cues[0]!, words)).toBe('Hi.');
    expect(cueText(cues[1]!, words)).toBe('Next one');
  });

  it('treats a closing quote or bracket after the stop as sentence-final', () => {
    const words = [word('done."', 0, 1), word('After', 1, 2)];

    expect(buildCues(words)).toHaveLength(2);
  });

  it('never exceeds the character budget or the line count', () => {
    // 60 words of 6 chars: far past a 2 x 42 budget.
    const words = Array.from({ length: 60 }, (_, i) =>
      word(`word${String(i).padStart(2, '0')}`, i * 0.4, i * 0.4 + 0.4)
    );
    const cues = buildCues(words);

    expect(cues.length).toBeGreaterThan(1);
    for (const cue of cues) {
      const lines = cueText(cue, words).split('\n');
      expect(lines.length).toBeLessThanOrEqual(R.maxLinesPerCue);
      for (const line of lines) {
        expect(line.length).toBeLessThanOrEqual(R.maxCharsPerLine);
      }
    }
  });

  // Regression. Uniform-length words always split evenly, so the test above
  // passed while real prose produced a 43-character line in a shipped SRT: the
  // cue measured 81 characters, inside the 84 budget, but no split of it left
  // both lines under 42. Grouping now gates on wrapping, not on the total.
  it('respects the per-line limit even when the total is inside the budget', () => {
    const sentence =
      'Hello, this is a test of the subtitle generator, it should produce three separate';
    const words = sentence
      .split(' ')
      .map((t, i) => word(t, i * 0.34, i * 0.34 + 0.34));

    // Precondition: the whole run is under the 2 x 42 budget, which is exactly
    // what made the old check pass it through.
    expect(sentence.length).toBeLessThanOrEqual(
      R.maxCharsPerLine * R.maxLinesPerCue
    );

    for (const cue of buildCues(words)) {
      for (const line of cueText(cue, words).split('\n')) {
        expect(line.length).toBeLessThanOrEqual(R.maxCharsPerLine);
      }
    }
  });

  it('holds the per-line limit across varied real prose', () => {
    const prose =
      'The committee unanimously recommended postponing the extraordinarily ' +
      'complicated restructuring proposal until stakeholders had sufficient ' +
      'opportunity to review it. Afterwards, everyone agreed that the ' +
      'documentation was insufficient, poorly organised, and occasionally ' +
      'contradictory in ways nobody had anticipated beforehand.';
    const words = prose
      .split(' ')
      .map((t, i) => word(t, i * 0.31, i * 0.31 + 0.31));

    const cues = buildCues(words);
    expect(cues.length).toBeGreaterThan(3);

    for (const cue of cues) {
      const lines = cueText(cue, words).split('\n');
      expect(lines.length).toBeLessThanOrEqual(R.maxLinesPerCue);
      for (const line of lines) {
        expect(line.length).toBeLessThanOrEqual(R.maxCharsPerLine);
      }
    }
  });

  it('gives an unbreakably long word its own line rather than dropping it', () => {
    const long = 'A'.repeat(60);
    const words = [word('short', 0, 1), word(long, 1, 2), word('tail', 2, 3)];
    const rendered = buildCues(words)
      .map((cue) => cueText(cue, words))
      .join('\n');

    expect(rendered).toContain(long);
    expect(rendered).toContain('short');
    expect(rendered).toContain('tail');
  });

  it('closes a cue that would outlast the maximum duration', () => {
    // Short text, long silences: only the duration rule can split this.
    const words = Array.from({ length: 6 }, (_, i) =>
      word('ok', i * 3, i * 3 + 0.2)
    );
    const cues = buildCues(words);

    for (const cue of cues) {
      const { start, end } = cueBounds(cue, words);
      expect(end - start).toBeLessThanOrEqual(R.maxCueDuration);
    }
  });

  it('covers every word exactly once, in order', () => {
    const words = Array.from({ length: 25 }, (_, i) =>
      word(`w${i}`, i * 0.5, i * 0.5 + 0.5)
    );
    const covered = buildCues(words).flatMap((cue) =>
      Array.from(
        { length: cue.wordEnd - cue.wordStart + 1 },
        (_, k) => cue.wordStart + k
      )
    );

    expect(covered).toEqual(words.map((_, i) => i));
  });

  it('balances the two lines when it breaks', () => {
    const words = 'alpha bravo charlie delta echo foxtrot golf hotel india'
      .split(' ')
      .map((t, i) => word(t, i, i + 1));
    const [cue] = buildCues(words);
    const lines = cueText(cue!, words).split('\n');

    expect(lines).toHaveLength(2);
    // Balanced within one word's worth of characters.
    expect(Math.abs(lines[0]!.length - lines[1]!.length)).toBeLessThan(10);
  });

  it('does not emit a line break at the cue start', () => {
    const words = [word('a'.repeat(60), 0, 2), word('b', 2, 3)];
    const [cue] = buildCues(words);

    expect(cue!.lineBreaks).not.toContain(cue!.wordStart);
  });
});

describe('normalizeCues', () => {
  it('extends a too-short cue up to the minimum duration', () => {
    const words = [word('Hi.', 0, 0.2), word('Later', 10, 11)];
    const cues = buildCues(words);
    const normalized = normalizeCues(words, cues);
    const { start, end } = cueBounds(normalized[0]!, words);

    expect(end - start).toBeCloseTo(R.minCueDuration);
  });

  it('never creates an overlap to satisfy the minimum duration', () => {
    // The next cue starts almost immediately, so there is no room to extend.
    const words = [word('Hi.', 0, 0.2), word('Now.', 0.25, 1.5)];
    const normalized = normalizeCues(words, buildCues(words));

    for (let i = 1; i < normalized.length; i += 1) {
      const previous = cueBounds(normalized[i - 1]!, words);
      const current = cueBounds(normalized[i]!, words);
      expect(previous.end).toBeLessThanOrEqual(current.start);
    }
  });

  it('leaves word timing untouched', () => {
    const words = [word('Hi.', 0, 0.2), word('Later', 10, 11)];
    const before = words.map((w) => ({ ...w }));
    normalizeCues(words, buildCues(words));

    expect(words).toEqual(before);
  });
});

describe('cueCps', () => {
  it('measures characters per second', () => {
    expect(cueCps('abcdefghij', 0, 1)).toBeCloseTo(10);
  });

  it('does not count line breaks as reading load', () => {
    expect(cueCps('abcde\nfghij', 0, 1)).toBeCloseTo(
      cueCps('abcde fghij', 0, 1)
    );
  });

  it('reports a zero-length cue as infinitely fast rather than dividing by zero', () => {
    expect(cueCps('abc', 5, 5)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('the core data-model invariant', () => {
  it('editing a word’s text does not move its start or end', () => {
    const words = wordsFromSegments([
      { text: 'the quick brown fox', start: 1, end: 3 },
    ]);
    const target = words[2]!;
    // Captured under different names on purpose: the assertions must read the
    // live object back, which destructured aliases would defeat.
    const startBefore = target.start;
    const endBefore = target.end;

    target.text = 'COMPLETELY DIFFERENT AND MUCH LONGER';
    target.edited = true;

    expect(target.start).toBe(startBefore);
    expect(target.end).toBe(endBefore);
    expect(target.origText).toBe('brown');
  });

  it('re-segmenting only rewrites index ranges, so it is lossless', () => {
    const words = wordsFromSegments([
      { text: 'one two three four five six', start: 0, end: 6 },
    ]);
    const snapshot = words.map((w) => ({ ...w }));

    buildCues(words, { ...R, maxCharsPerLine: 8 });
    buildCues(words, { ...R, maxCharsPerLine: 42 });

    expect(words).toEqual(snapshot);
  });
});
