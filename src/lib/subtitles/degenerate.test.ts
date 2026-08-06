import { describe, expect, it } from 'vitest';

import {
  collapseDegenerateRuns,
  countDegenerateSegments,
  MAX_ARTICULATION_CPS,
} from './degenerate';
import type { AsrSegment } from './types';

/** A run of `count` identical segments evenly filling `[start, end]`. */
function run(
  text: string,
  count: number,
  start: number,
  end: number
): AsrSegment[] {
  const step = (end - start) / count;

  return Array.from({ length: count }, (_, i) => ({
    text,
    start: start + i * step,
    end: start + (i + 1) * step,
  }));
}

describe('collapseDegenerateRuns', () => {
  it('collapses the fixture’s 86-repeat "Thank you." loop to one segment', () => {
    // The measured pathology: 86 identical segments across 2.9 s of audio,
    // which implies 296 CPS.
    const segments = run('Thank you.', 86, 2338.63, 2341.47);

    const out = collapseDegenerateRuns(segments);

    expect(out).toHaveLength(1);
    expect(out[0]!.text).toBe('Thank you.');
    // The span is preserved, so the cue is readable rather than 34 ms long.
    expect(out[0]!.start).toBeCloseTo(2338.63, 5);
    expect(out[0]!.end).toBeCloseTo(2341.47, 5);
  });

  it('collapses the fixture’s 44-repeat run', () => {
    const out = collapseDegenerateRuns(run('Yeah, you can be...', 44, 1181, 1189));

    expect(out).toHaveLength(1);
    expect(out[0]!.end - out[0]!.start).toBeCloseTo(8, 5);
  });

  it('leaves genuine repetition alone when the articulation rate is possible', () => {
    // "No." three times over 1.5 s is 6 characters at 4 CPS. Real speech.
    const segments = run('No.', 3, 10, 11.5);

    expect(collapseDegenerateRuns(segments)).toBe(segments);
  });

  it('returns the input array unchanged when nothing is degenerate', () => {
    const segments: AsrSegment[] = [
      { text: 'Hello there.', start: 0, end: 1.5 },
      { text: 'How are you?', start: 1.6, end: 3 },
    ];

    // Identity, not just equality: React can skip re-rendering on a no-op.
    expect(collapseDegenerateRuns(segments)).toBe(segments);
  });

  it('treats a zero-length span as degenerate rather than dividing by it', () => {
    const segments: AsrSegment[] = [
      { text: 'you', start: 5, end: 5 },
      { text: 'you', start: 5, end: 5 },
    ];

    const out = collapseDegenerateRuns(segments);

    expect(out).toHaveLength(1);
    expect(Number.isFinite(out[0]!.end)).toBe(true);
  });

  it('keeps the surrounding transcript intact around a collapsed run', () => {
    const segments: AsrSegment[] = [
      { text: "I think that's all right.", start: 2336.2, end: 2338.11 },
      ...run('Thank you.', 86, 2338.63, 2341.47),
      { text: 'Amen.', start: 2341.58, end: 2341.84 },
    ];

    const out = collapseDegenerateRuns(segments);

    expect(out).toHaveLength(3);
    expect(out.map((s) => s.text)).toEqual([
      "I think that's all right.",
      'Thank you.',
      'Amen.',
    ]);
  });

  it('collapses two separate runs independently', () => {
    const segments: AsrSegment[] = [
      ...run('Thank you.', 40, 100, 101),
      { text: 'And then we spoke.', start: 102, end: 104 },
      ...run('Okay.', 30, 105, 106),
    ];

    expect(collapseDegenerateRuns(segments)).toHaveLength(3);
  });

  it('matches runs across differing punctuation and case', () => {
    const segments: AsrSegment[] = [
      { text: 'Thank you.', start: 0, end: 0.02 },
      { text: 'thank you', start: 0.02, end: 0.04 },
      { text: 'Thank you!', start: 0.04, end: 0.06 },
    ];

    expect(collapseDegenerateRuns(segments)).toHaveLength(1);
  });

  it('ignores empty-text runs rather than merging unrelated blanks', () => {
    const segments: AsrSegment[] = [
      { text: '...', start: 0, end: 0.01 },
      { text: '!', start: 0.01, end: 0.02 },
    ];

    expect(collapseDegenerateRuns(segments)).toHaveLength(2);
  });

  it('holds the threshold at the documented boundary', () => {
    // "Thank you." is 9 non-whitespace characters, so 2 repeats is 18.
    const chars = 18;
    const safe = chars / (MAX_ARTICULATION_CPS - 1);
    expect(collapseDegenerateRuns(run('Thank you.', 2, 0, safe))).toHaveLength(2);

    const unsafe = chars / (MAX_ARTICULATION_CPS + 1);
    expect(collapseDegenerateRuns(run('Thank you.', 2, 0, unsafe))).toHaveLength(
      1
    );
  });

  it('passes short inputs straight through', () => {
    expect(collapseDegenerateRuns([])).toEqual([]);
    const one: AsrSegment[] = [{ text: 'Hi.', start: 0, end: 1 }];
    expect(collapseDegenerateRuns(one)).toBe(one);
  });
});

describe('countDegenerateSegments', () => {
  it('reports the fixture’s total junk segment count', () => {
    const segments: AsrSegment[] = [
      ...run('Thank you.', 86, 2338.63, 2341.47),
      ...run('Yeah, you can be...', 44, 1181, 1189),
    ];

    // 86 + 44 segments become 2, so 128 were junk — the measured figure.
    expect(countDegenerateSegments(segments)).toBe(128);
  });

  it('reports zero for a clean transcript', () => {
    expect(
      countDegenerateSegments([{ text: 'Hello.', start: 0, end: 1 }])
    ).toBe(0);
  });
});
