import { describe, expect, it } from 'vitest';

import {
  clearRealignmentMarks,
  windowsNeedingRealignment,
} from './apply-alignment';
import type { Word } from './types';

/** Twenty words, one per second. */
function transcript(): Word[] {
  return Array.from({ length: 20 }, (_, i) => ({
    id: `w${i}`,
    text: `word${i}`,
    origText: `word${i}`,
    start: i,
    end: i + 1,
    conf: 0.9,
    edited: false,
    timeLocked: false,
  }));
}

const mark = (words: Word[], index: number, patch: Partial<Word>): Word[] =>
  words.map((w, i) => (i === index ? { ...w, ...patch } : w));

describe('windowsNeedingRealignment', () => {
  it('returns nothing when nothing was edited', () => {
    expect(windowsNeedingRealignment(transcript(), 20)).toEqual([]);
  });

  it('selects only the window holding the edit', () => {
    const words = mark(transcript(), 3, { edited: true });

    const windows = windowsNeedingRealignment(words, 20);

    expect(windows).toHaveLength(1);
    expect(windows[0]!.from).toBeLessThanOrEqual(3);
    expect(windows[0]!.to).toBeGreaterThan(3);
  });

  it('skips a window whose only edited word is timeLocked', () => {
    // The human dragged this boundary; re-aligning would overwrite their decision.
    const words = mark(transcript(), 3, { edited: true, timeLocked: true });

    expect(windowsNeedingRealignment(words, 20)).toEqual([]);
  });

  it('still selects a window with one locked and one unlocked edit', () => {
    let words = mark(transcript(), 3, { edited: true, timeLocked: true });
    words = mark(words, 4, { edited: true });

    expect(windowsNeedingRealignment(words, 20)).toHaveLength(1);
  });

  it('covers edits far apart without covering the middle', () => {
    let words = mark(transcript(), 1, { edited: true });
    words = mark(words, 18, { edited: true });

    const windows = windowsNeedingRealignment(words, 20, {
      maxSeconds: 5,
      pad: 0.25,
    });

    expect(windows.length).toBeGreaterThanOrEqual(2);
    // Nothing selected should sit entirely between the two edits.
    for (const w of windows) {
      const holdsAnEdit = [1, 18].some((i) => i >= w.from && i < w.to);
      expect(holdsAnEdit).toBe(true);
    }
  });
});

describe('clearRealignmentMarks', () => {
  it('clears edited inside the re-aligned windows only', () => {
    let words = mark(transcript(), 2, { edited: true });
    words = mark(words, 15, { edited: true });

    const windows = windowsNeedingRealignment(words, 20, {
      maxSeconds: 5,
      pad: 0.25,
    }).slice(0, 1);
    const out = clearRealignmentMarks(words, windows);

    const inWindow = windows[0]!;
    expect(out[2]!.edited).toBe(inWindow.from <= 2 && inWindow.to > 2 ? false : true);
    // The far edit is untouched, so a later pass still knows to revisit it.
    expect(out[15]!.edited).toBe(true);
  });

  it('leaves origText alone, so "the user changed this" survives', () => {
    const words = mark(transcript(), 2, { edited: true, text: 'ARC' });

    const out = clearRealignmentMarks(words, [{ from: 0, to: 20, start: 0, end: 20 }]);

    expect(out[2]!.edited).toBe(false);
    expect(out[2]!.text).not.toBe(out[2]!.origText);
  });

  it('never touches timing', () => {
    const words = mark(transcript(), 2, { edited: true });

    const out = clearRealignmentMarks(words, [{ from: 0, to: 20, start: 0, end: 20 }]);

    for (const [i, w] of out.entries()) {
      expect(w.start).toBe(words[i]!.start);
      expect(w.end).toBe(words[i]!.end);
    }
  });

  it('returns the input unchanged when there is nothing to clear', () => {
    const words = transcript();

    expect(clearRealignmentMarks(words, [])).toBe(words);
    expect(
      clearRealignmentMarks(words, [{ from: 0, to: 20, start: 0, end: 20 }])
    ).toBe(words);
  });
});
