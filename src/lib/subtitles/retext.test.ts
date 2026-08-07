import { beforeEach, describe, expect, it } from 'vitest';

import { resetRetextIds, retextCue } from './retext';
import type { Cue, Word } from './types';

function word(text: string, start: number, end: number, extra: Partial<Word> = {}): Word {
  return {
    id: `w-${text}-${start}`,
    text,
    origText: text,
    start,
    end,
    conf: 0.9,
    edited: false,
    timeLocked: false,
    ...extra,
  };
}

/** Three cues of two words each, over six seconds. */
function fixture(): { words: Word[]; cues: Cue[] } {
  const words = [
    word('the', 0, 1),
    word('arrc', 1, 2),
    word('number', 2, 3),
    word('is', 3, 4),
    word('wrong', 4, 5),
    word('here', 5, 6),
  ];
  const cues: Cue[] = [
    { id: 'c1', wordStart: 0, wordEnd: 2, lineBreaks: [] },
    { id: 'c2', wordStart: 3, wordEnd: 4, lineBreaks: [4] },
    { id: 'c3', wordStart: 5, wordEnd: 5, lineBreaks: [] },
  ];

  return { words, cues };
}

beforeEach(resetRetextIds);

describe('retextCue — the timing invariant', () => {
  it('leaves start and end byte-identical when only text changes', () => {
    const { words, cues } = fixture();

    const out = retextCue(words, cues, 0, 'The ARC number');

    for (const [i, w] of out.words.slice(0, 3).entries()) {
      // toBe, not toBeCloseTo: approximate preservation is not preservation.
      expect(w.start).toBe(words[i]!.start);
      expect(w.end).toBe(words[i]!.end);
    }
    expect(out.words.slice(0, 3).map((w) => w.text)).toEqual([
      'The',
      'ARC',
      'number',
    ]);
  });

  it('treats a punctuation or capitalisation fix as the same word', () => {
    const { words, cues } = fixture();

    const out = retextCue(words, cues, 0, 'The, arrc. number!');

    // Same count, same timings, and every word still carries its own id — so
    // nothing was spliced and no confidence was discarded.
    expect(out.words).toHaveLength(6);
    expect(out.words[1]!.id).toBe(words[1]!.id);
    expect(out.words[1]!.conf).toBe(0.9);
    expect(out.words[1]!.start).toBe(1);
  });

  it('marks a changed word edited and keeps origText for diffing', () => {
    const { words, cues } = fixture();

    const out = retextCue(words, cues, 0, 'the ARC number');

    expect(out.words[1]!.edited).toBe(true);
    expect(out.words[1]!.origText).toBe('arrc');
    expect(out.words[0]!.edited).toBe(false);
  });

  it('returns the inputs unchanged when nothing changed', () => {
    const { words, cues } = fixture();

    const out = retextCue(words, cues, 0, 'the arrc number');

    expect(out.words).toBe(words);
    expect(out.cues).toBe(cues);
  });
});

describe('retextCue — word count changes and reindexing', () => {
  it('reindexes every following cue when one word becomes two', () => {
    const { words, cues } = fixture();

    const out = retextCue(words, cues, 0, 'the ARC Limited number');

    expect(out.words).toHaveLength(7);
    expect(out.cues[0]).toMatchObject({ wordStart: 0, wordEnd: 3 });
    expect(out.cues[1]).toMatchObject({ wordStart: 4, wordEnd: 5 });
    expect(out.cues[2]).toMatchObject({ wordStart: 6, wordEnd: 6 });
  });

  it('shifts the following cues’ line breaks too', () => {
    const { words, cues } = fixture();

    const out = retextCue(words, cues, 0, 'the ARC Limited number');

    // c2's break was at word 4 and its words all moved up by one.
    expect(out.cues[1]!.lineBreaks).toEqual([5]);
  });

  it('reindexes when words are removed', () => {
    const { words, cues } = fixture();

    const out = retextCue(words, cues, 0, 'ARC');

    expect(out.words).toHaveLength(4);
    expect(out.cues[0]).toMatchObject({ wordStart: 0, wordEnd: 0 });
    expect(out.cues[1]).toMatchObject({ wordStart: 1, wordEnd: 2 });
    expect(out.cues[2]).toMatchObject({ wordStart: 3, wordEnd: 3 });
  });

  it('keeps every cue’s words contiguous and in order after a splice', () => {
    const { words, cues } = fixture();

    const out = retextCue(words, cues, 1, 'is definitely very wrong');

    // Each cue still covers a valid range, and the ranges tile the word list.
    let expected = 0;
    for (const cue of out.cues) {
      expect(cue.wordStart).toBe(expected);
      expect(cue.wordEnd).toBeGreaterThanOrEqual(cue.wordStart);
      expected = cue.wordEnd + 1;
    }
    expect(expected).toBe(out.words.length);
  });

  it('leaves earlier cues completely untouched', () => {
    const { words, cues } = fixture();

    const out = retextCue(words, cues, 2, 'here we are');

    expect(out.cues[0]).toBe(cues[0]);
    expect(out.cues[1]).toBe(cues[1]);
    expect(out.words.slice(0, 5)).toEqual(words.slice(0, 5));
  });

  it('keeps inserted words inside the cue’s original span', () => {
    const { words, cues } = fixture();

    const out = retextCue(words, cues, 0, 'the ARC Limited number');
    const inCue = out.words.slice(0, 4);

    expect(inCue[0]!.start).toBe(0);
    expect(inCue.at(-1)!.end).toBe(3);
    for (let i = 1; i < inCue.length; i += 1) {
      expect(inCue[i]!.start).toBeGreaterThanOrEqual(inCue[i - 1]!.start);
      expect(inCue[i]!.end).toBeGreaterThanOrEqual(inCue[i]!.start);
    }
  });

  it('marks re-segmented words unmeasured rather than confident', () => {
    const { words, cues } = fixture();

    const out = retextCue(words, cues, 0, 'the ARC Limited number');
    const inserted = out.words.slice(1, 3);

    for (const w of inserted) {
      // conf 0 means unmeasured, which qc.ts already distinguishes from badly
      // aligned — these must not read as alignment failures.
      expect(w.conf).toBe(0);
      expect(w.edited).toBe(true);
    }
  });
});

describe('retextCue — guards', () => {
  it('refuses to empty a cue', () => {
    const { words, cues } = fixture();

    expect(retextCue(words, cues, 0, '   ').words).toBe(words);
    expect(retextCue(words, cues, 0, '').cues).toBe(cues);
  });

  it('ignores a cue index that does not exist', () => {
    const { words, cues } = fixture();

    expect(retextCue(words, cues, 9, 'anything').words).toBe(words);
  });

  it('clears the edited cue’s own line breaks, which no longer fit', () => {
    const { words, cues } = fixture();

    const out = retextCue(words, cues, 1, 'is very wrong indeed');

    expect(out.cues[1]!.lineBreaks).toEqual([]);
  });

  it('preserves a lock through an in-place substitution', () => {
    const { cues } = fixture();
    const words = [
      word('the', 0, 1),
      word('arrc', 1, 2, { timeLocked: true }),
      word('number', 2, 3),
      word('is', 3, 4),
      word('wrong', 4, 5),
      word('here', 5, 6),
    ];

    const out = retextCue(words, cues, 0, 'the ARC number');

    expect(out.words[1]!.timeLocked).toBe(true);
    expect(out.words[1]!.start).toBe(1);
  });
});

describe('retextCue — round trips', () => {
  it('returns to the original text through a sequence of edits', () => {
    const { words, cues } = fixture();
    const render = (w: Word[], c: Cue) =>
      w.slice(c.wordStart, c.wordEnd + 1).map((x) => x.text).join(' ');

    let state = retextCue(words, cues, 0, 'the ARC Limited number');
    state = retextCue(state.words, state.cues, 0, 'the arrc number');

    expect(render(state.words, state.cues[0]!)).toBe('the arrc number');
    expect(state.words).toHaveLength(6);
    // The cues are back where they started.
    expect(state.cues.map((c) => [c.wordStart, c.wordEnd])).toEqual([
      [0, 2],
      [3, 4],
      [5, 5],
    ]);
  });

  it('survives edits applied to several cues in turn', () => {
    const { words, cues } = fixture();

    let state = { words, cues };
    state = retextCue(state.words, state.cues, 2, 'here and there');
    state = retextCue(state.words, state.cues, 0, 'ARC');
    state = retextCue(state.words, state.cues, 1, 'is quite wrong');

    let expected = 0;
    for (const cue of state.cues) {
      expect(cue.wordStart).toBe(expected);
      expected = cue.wordEnd + 1;
    }
    expect(expected).toBe(state.words.length);
    expect(
      state.words.map((w) => w.text).join(' ')
    ).toBe('ARC is quite wrong here and there');
  });
});
