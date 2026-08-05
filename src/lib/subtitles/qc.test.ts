import { describe, expect, it } from 'vitest';

import { buildCues, normalizeCues } from './cues';
import { checkCues, DEFAULT_QC, summarize } from './qc';
import type { Cue, Word } from './types';

function word(text: string, start: number, end: number, conf = 0.9): Word {
  return {
    id: `${text}-${start}`,
    text,
    origText: text,
    start,
    end,
    conf,
    edited: false,
    timeLocked: false,
  };
}

const kinds = (words: Word[], cues: Cue[]) =>
  checkCues(words, cues).map((i) => i.kind);

describe('checkCues', () => {
  it('reports nothing for a clean track', () => {
    const words = [
      word('Hello', 0, 0.6),
      word('there.', 0.6, 1.4),
      word('Second', 3, 3.6),
      word('cue.', 3.6, 4.4),
    ];
    const cues = normalizeCues(words, buildCues(words));

    expect(summarize(checkCues(words, cues)).clean).toBe(true);
  });

  // M3's stated acceptance criterion: a deliberately seeded violation is caught.
  it('flags a seeded reading-speed violation with the measured number', () => {
    // 60 characters in 0.9s is about 67 CPS, far past the 20 ceiling.
    const text = 'a'.repeat(58);
    const words = [word(`${text}.`, 0, 0.9)];
    const issues = checkCues(words, [
      { id: 'c', wordStart: 0, wordEnd: 0, lineBreaks: [] },
    ]);
    const speed = issues.find((i) => i.kind === 'reading-speed');

    expect(speed).toBeDefined();
    expect(speed!.severity).toBe('warning');
    expect(speed!.message).toMatch(/characters per second/);
    expect(speed!.value).toBeGreaterThan(60);
  });

  it('flags an overlap as an error, not a warning', () => {
    // Malformed output a player may reject outright.
    const words = [word('One.', 0, 2), word('Two.', 1, 3)];
    const cues: Cue[] = [
      { id: 'a', wordStart: 0, wordEnd: 0, lineBreaks: [] },
      { id: 'b', wordStart: 1, wordEnd: 1, lineBreaks: [] },
    ];
    const issues = checkCues(words, cues);
    const overlap = issues.find((i) => i.kind === 'overlap');

    expect(overlap!.severity).toBe('error');
    expect(overlap!.message).toMatch(/Overlaps the next cue/);
  });

  it('flags a gap that is merely too small as a warning', () => {
    const words = [word('One.', 0, 1), word('Two.', 1.02, 2)];
    const cues: Cue[] = [
      { id: 'a', wordStart: 0, wordEnd: 0, lineBreaks: [] },
      { id: 'b', wordStart: 1, wordEnd: 1, lineBreaks: [] },
    ];

    expect(kinds(words, cues)).toContain('gap-too-small');
  });

  it('flags a cue that is too short and one that is too long', () => {
    const short = [word('Hi.', 0, 0.2)];
    const long = [word('Lingering.', 0, 9)];
    const one: Cue[] = [{ id: 'c', wordStart: 0, wordEnd: 0, lineBreaks: [] }];

    expect(kinds(short, one)).toContain('too-short');
    expect(kinds(long, one)).toContain('too-long');
  });

  it('flags an over-long line as an error', () => {
    const words = [word('x'.repeat(60), 0, 5)];
    const issues = checkCues(words, [
      { id: 'c', wordStart: 0, wordEnd: 0, lineBreaks: [] },
    ]);

    expect(issues.find((i) => i.kind === 'line-too-long')!.severity).toBe(
      'error'
    );
  });

  it('flags more than two lines', () => {
    const words = [word('a', 0, 1), word('b', 1, 2), word('c', 2, 3)];
    const cues: Cue[] = [
      { id: 'c', wordStart: 0, wordEnd: 2, lineBreaks: [1, 2] },
    ];

    expect(kinds(words, cues)).toContain('too-many-lines');
  });

  it('flags an unrenderable zero-duration cue', () => {
    const words = [word('Hi.', 1, 1)];

    expect(
      kinds(words, [{ id: 'c', wordStart: 0, wordEnd: 0, lineBreaks: [] }])
    ).toContain('empty');
  });

  it('reports an empty cue once and stops checking it', () => {
    const words = [word('', 5, 5)];
    const issues = checkCues(words, [
      { id: 'c', wordStart: 0, wordEnd: 0, lineBreaks: [] },
    ]);

    expect(issues).toHaveLength(1);
    expect(issues[0]!.kind).toBe('empty');
  });
});

describe('low-confidence reporting', () => {
  const cues: Cue[] = [{ id: 'c', wordStart: 0, wordEnd: 1, lineBreaks: [] }];

  it('flags a cue containing a poorly-aligned word', () => {
    const words = [word('Hello', 0, 1, 0.9), word('there.', 1, 2, 0.05)];

    expect(kinds(words, cues)).toContain('low-confidence');
  });

  it('does not flag words that were never scored at all', () => {
    // Estimated words carry conf 0, which means "unmeasured", not "bad". Flagging
    // them would make every cue in an un-aligned transcript a warning.
    const words = [word('Hello', 0, 1, 0), word('there.', 1, 2, 0)];

    expect(kinds(words, cues)).not.toContain('low-confidence');
  });

  it('can be disabled', () => {
    const words = [word('Hello', 0, 1, 0.9), word('there.', 1, 2, 0.05)];
    const issues = checkCues(words, cues, {
      ...DEFAULT_QC,
      minConfidence: 0,
    });

    expect(issues.map((i) => i.kind)).not.toContain('low-confidence');
  });
});

describe('summarize', () => {
  it('separates errors from warnings', () => {
    const words = [word('One.', 0, 2), word('Two.', 1, 3)];
    const cues: Cue[] = [
      { id: 'a', wordStart: 0, wordEnd: 0, lineBreaks: [] },
      { id: 'b', wordStart: 1, wordEnd: 1, lineBreaks: [] },
    ];
    const summary = summarize(checkCues(words, cues));

    expect(summary.errors).toBeGreaterThan(0);
    expect(summary.clean).toBe(false);
    expect(summary.byKind.overlap).toBe(1);
  });

  it('is clean for no issues', () => {
    expect(summarize([])).toMatchObject({
      errors: 0,
      warnings: 0,
      clean: true,
    });
  });
});
