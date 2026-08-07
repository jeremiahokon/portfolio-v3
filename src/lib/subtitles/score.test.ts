import { describe, expect, it } from 'vitest';

import {
  boundaries,
  chooseTier,
  formatReport,
  isHardWord,
  passesGate,
  scoreAlignment,
  scoreBoundaries,
  type ScoreReportRow,
  scoreWords,
  type TimedWord,
} from './score';

function w(text: string, start: number, end: number): TimedWord {
  return { text, start, end };
}

/** Shifts every boundary by a fixed amount, simulating a calibration offset. */
function shift(words: TimedWord[], by: number): TimedWord[] {
  return words.map((x) => ({ ...x, start: x.start + by, end: x.end + by }));
}

const reference: TimedWord[] = [
  w('the', 0.5, 0.72),
  w('quick', 0.72, 1.1),
  w('brown', 1.1, 1.48),
  w('fox', 1.48, 1.9),
];

describe('boundaries', () => {
  it('takes a start and an end from every word', () => {
    expect(boundaries([w('a', 0, 1), w('b', 1, 2)])).toEqual([0, 1, 1, 2]);
  });

  it('keeps the shared instant between adjacent words as two boundaries', () => {
    // Collapsing it would halve the weight of fluent speech relative to
    // isolated words, which is the opposite of what we want to measure.
    expect(boundaries([w('a', 0, 1), w('b', 1, 2)]).length).toBe(4);
  });

  it('sorts out-of-order input', () => {
    expect(boundaries([w('b', 5, 6), w('a', 0, 1)])).toEqual([0, 1, 5, 6]);
  });
});

describe('scoreBoundaries', () => {
  it('scores a perfect alignment as 1.0 on both metrics', () => {
    const b = boundaries(reference);
    const score = scoreBoundaries(b, b);

    expect(score.precision).toBe(1);
    expect(score.recall).toBe(1);
    expect(score.maxAbsoluteError).toBe(0);
  });

  it('forgives error inside the collar', () => {
    const score = scoreBoundaries(
      boundaries(reference),
      boundaries(shift(reference, 0.15)),
      0.2
    );

    expect(score.recall).toBe(1);
    expect(score.meanAbsoluteError).toBeCloseTo(0.15, 6);
  });

  it('rejects error outside the collar', () => {
    const score = scoreBoundaries([1, 5, 9], [1.35, 5.35, 9.35], 0.2);

    expect(score.recall).toBe(0);
  });

  // The reason scoreWords exists. Documented as a known limitation rather than
  // fixed, because the time-only metric is still the right tool for detecting
  // invented boundaries — it is just the wrong tool for the gate.
  it('has a known blind spot: a uniform drift through dense speech', () => {
    // Every word attributed to the wrong span — an unambiguous failure — yet
    // boundaries 0.22-0.42s apart mean each drifted one lands within the collar
    // of its neighbour.
    const score = scoreBoundaries(
      boundaries(reference),
      boundaries(shift(reference, 0.35)),
      0.2
    );

    expect(score.recall).toBeGreaterThan(0.5);
    // scoreWords must not be fooled by the same input.
    expect(
      scoreWords(reference, shift(reference, 0.35), { collar: 0.2 }).recall
    ).toBe(0);
  });

  it('punishes a flood of invented boundaries through precision', () => {
    // This is the degenerate aligner the gate exists to catch: emit a boundary
    // every 50 ms and recall looks excellent.
    const spam = Array.from({ length: 200 }, (_, i) => i * 0.05);
    const score = scoreBoundaries(boundaries(reference), spam, 0.2);

    expect(score.recall).toBeGreaterThan(0.9);
    expect(score.precision).toBeLessThan(0.1);
    expect(passesGate(score)).toBe(false);
  });

  it('matches one-to-one, so a cluster cannot claim the same reference twice', () => {
    // Four hypothesis boundaries crowded around a single reference boundary.
    const score = scoreBoundaries([1.0], [0.95, 0.97, 1.01, 1.03], 0.2);

    expect(score.hits).toBe(1);
    expect(score.spurious).toBe(3);
  });

  it('counts a missed reference boundary', () => {
    const score = scoreBoundaries([1, 5, 9], [1, 9], 0.2);

    expect(score.missed).toBe(1);
    expect(score.hits).toBe(2);
  });

  it('reports zero rather than dividing by zero on empty input', () => {
    expect(scoreBoundaries([], []).precision).toBe(0);
    expect(scoreBoundaries([1, 2], []).recall).toBe(0);
    expect(scoreBoundaries([], [1, 2]).precision).toBe(0);
  });

  it('surfaces an outlier through max error even when the mean looks fine', () => {
    // Nine perfect boundaries and one off by 190 ms: the mean barely moves,
    // which is exactly why the gate reports the max too.
    const ref = Array.from({ length: 10 }, (_, i) => i);
    const hyp = [...ref];
    hyp[9] = 9.19;
    const score = scoreBoundaries(ref, hyp, 0.2);

    expect(score.meanAbsoluteError).toBeLessThan(0.02);
    expect(score.maxAbsoluteError).toBeCloseTo(0.19, 6);
  });

  it('does not let a late hypothesis boundary match an early reference one', () => {
    const score = scoreBoundaries([0, 10], [10, 20], 0.2);

    expect(score.hits).toBe(1);
    expect(score.missed).toBe(1);
    expect(score.spurious).toBe(1);
  });
});

describe('scoreWords', () => {
  it('scores a perfect alignment as 1.0', () => {
    const score = scoreWords(reference, reference, { collar: 0.2 });

    expect(score.precision).toBe(1);
    expect(score.recall).toBe(1);
    expect(score.pairedWords).toBe(4);
  });

  it('forgives error inside the collar', () => {
    expect(
      scoreWords(reference, shift(reference, 0.15), { collar: 0.2 }).recall
    ).toBe(1);
  });

  it('fails a uniform drift, unlike the time-only metric', () => {
    expect(
      scoreWords(reference, shift(reference, 0.25), { collar: 0.2 }).recall
    ).toBe(0);
  });

  it('requires both of a word’s boundaries to land', () => {
    // Start correct, end 400 ms late: half the boundaries hit.
    const hyp = [{ text: 'the', start: 0.5, end: 1.12 }];
    const score = scoreWords([reference[0]!], hyp, { collar: 0.2 });

    expect(score.hits).toBe(1);
    expect(score.recall).toBe(0.5);
  });

  it('counts a word the aligner never placed as missed, not excluded', () => {
    const hyp = [reference[0]!, reference[1]!];
    const score = scoreWords(reference, hyp, { collar: 0.2 });

    expect(score.unpairedReference).toBe(2);
    // 8 reference boundaries, only 4 could be hit.
    expect(score.recall).toBe(0.5);
    expect(score.precision).toBe(1);
  });

  it('pairs by text so one extra hypothesis word does not misalign the rest', () => {
    const hyp = [
      reference[0]!,
      { text: 'um', start: 0.72, end: 0.8 },
      ...reference.slice(1),
    ];
    const score = scoreWords(reference, hyp, { collar: 0.2 });

    expect(score.pairedWords).toBe(4);
    expect(score.unpairedHypothesis).toBe(1);
    expect(score.recall).toBe(1);
  });

  it('ignores case and punctuation when pairing', () => {
    const hyp = reference.map((x) => ({
      ...x,
      text: `${x.text.toUpperCase()},`,
    }));

    expect(scoreWords(reference, hyp, { collar: 0.2 }).pairedWords).toBe(4);
  });

  it('reports zero rather than dividing by zero on empty input', () => {
    expect(scoreWords([], [], { collar: 0.2 }).recall).toBe(0);
  });
});

describe('scoreAlignment', () => {
  it('scores a word list against the reference', () => {
    expect(scoreAlignment(reference, reference).f1).toBe(1);
  });

  it('applies the filter to both sides', () => {
    const ref = [w('call', 0, 0.5), w('0803', 0.5, 1.5), w('now', 1.5, 2)];
    // The digits are badly placed; the ordinary words are perfect.
    const hyp = [w('call', 0, 0.5), w('0803', 0.9, 1.9), w('now', 1.5, 2)];

    const overall = scoreAlignment(ref, hyp, { collar: 0.2 });
    const hard = scoreAlignment(ref, hyp, { collar: 0.2, filter: isHardWord });

    expect(hard.recall).toBeLessThan(overall.recall);
    expect(hard.referenceCount).toBe(2);
  });
});

describe('isHardWord', () => {
  it('catches digits in any form', () => {
    for (const text of ['2026', '14:30', '3rd', '$40']) {
      expect(isHardWord(w(text, 0, 1))).toBe(true);
    }
  });

  it('catches acronyms', () => {
    expect(isHardWord(w('API', 0, 1))).toBe(true);
    expect(isHardWord(w('NASA', 0, 1))).toBe(true);
  });

  it('catches spoken symbols', () => {
    expect(isHardWord(w('50%', 0, 1))).toBe(true);
    expect(isHardWord(w('R&D', 0, 1))).toBe(true);
  });

  it('leaves ordinary words alone, including capitalised ones', () => {
    for (const text of ['the', 'Jeremiah', 'Upwork', "don't"]) {
      expect(isHardWord(w(text, 0, 1))).toBe(false);
    }
  });
});

describe('passesGate', () => {
  const base = {
    f1: 0,
    hits: 0,
    missed: 0,
    spurious: 0,
    referenceCount: 0,
    hypothesisCount: 0,
    meanAbsoluteError: 0,
    maxAbsoluteError: 0,
  };

  it('requires both metrics, not their average', () => {
    // 0.99 / 0.81 averages above 0.9 and must still fail.
    expect(passesGate({ ...base, precision: 0.99, recall: 0.81 })).toBe(false);
    expect(passesGate({ ...base, precision: 0.9, recall: 0.9 })).toBe(true);
  });
});

describe('chooseTier', () => {
  const row = (
    label: string,
    approxBytes: number,
    precision: number,
    recall: number
  ): ScoreReportRow => ({
    label,
    approxBytes,
    overall: {
      precision,
      recall,
      f1: 0,
      hits: 0,
      missed: 0,
      spurious: 0,
      referenceCount: 0,
      hypothesisCount: 0,
      meanAbsoluteError: 0,
      maxAbsoluteError: 0,
    },
  });

  it('ships the smallest tier that passes, not the most accurate', () => {
    const rows = [
      row('fp16', 189_000_000, 0.99, 0.99),
      row('int8', 95_000_000, 0.93, 0.92),
      row('q4f16', 66_000_000, 0.91, 0.91),
    ];

    expect(chooseTier(rows)?.label).toBe('q4f16');
  });

  it('skips a smaller tier that fails', () => {
    const rows = [
      row('fp16', 189_000_000, 0.99, 0.99),
      row('q4f16', 66_000_000, 0.7, 0.7),
    ];

    expect(chooseTier(rows)?.label).toBe('fp16');
  });

  it('returns null when nothing passes, which is the B4 decision branch', () => {
    expect(chooseTier([row('q4f16', 66_000_000, 0.4, 0.4)])).toBeNull();
  });
});

describe('formatReport', () => {
  it('renders every tier tried, passing or not', () => {
    const rows: ScoreReportRow[] = [
      {
        label: 'fp16',
        approxBytes: 189_118_943,
        overall: {
          precision: 0.95,
          recall: 0.94,
          f1: 0.945,
          hits: 100,
          missed: 6,
          spurious: 5,
          referenceCount: 106,
          hypothesisCount: 105,
          meanAbsoluteError: 0.042,
          maxAbsoluteError: 0.19,
        },
      },
      {
        label: 'q4f16',
        approxBytes: 66_435_863,
        overall: {
          precision: 0.6,
          recall: 0.58,
          f1: 0.59,
          hits: 60,
          missed: 46,
          spurious: 40,
          referenceCount: 106,
          hypothesisCount: 100,
          meanAbsoluteError: 0.11,
          maxAbsoluteError: 0.2,
        },
      },
    ];

    const table = formatReport(rows);

    expect(table).toContain('fp16');
    expect(table).toContain('q4f16');
    expect(table).toContain('PASS');
    expect(table).toContain('fail');
    expect(table).toContain('42 ms');
  });
});
