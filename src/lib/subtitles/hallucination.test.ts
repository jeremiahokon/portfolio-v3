import { describe, expect, it } from 'vitest';

import {
  dropHallucinations,
  ISOLATION_GAP,
  QUIET_RMS,
  rmsProbe,
} from './hallucination';
import type { AsrSegment } from './types';

/** A probe that reports `rms` for everything. */
const flat = (rms: number) => ({ rmsAt: () => rms });

describe('dropHallucinations', () => {
  it('drops the fixture’s phantom "you" over the join chime', () => {
    // The measured shape: "you" at 0–2s, then 333s of nothing.
    const segments: AsrSegment[] = [
      { text: 'you', start: 0, end: 2 },
      { text: 'Hi, Trevor.', start: 335, end: 337 },
    ];

    const out = dropHallucinations(segments, flat(QUIET_RMS / 2));

    expect(out.map((s) => s.text)).toEqual(['Hi, Trevor.']);
  });

  it('keeps a stock phrase that is loud enough to be real', () => {
    const segments: AsrSegment[] = [
      { text: 'Thank you.', start: 0, end: 2 },
      { text: 'Next.', start: 100, end: 101 },
    ];

    // Isolated and stock, but the audio says somebody spoke.
    expect(dropHallucinations(segments, flat(0.14))).toHaveLength(2);
  });

  it('keeps a stock phrase in the middle of conversation', () => {
    const segments: AsrSegment[] = [
      { text: 'That works for me.', start: 10, end: 11.5 },
      { text: 'Thank you.', start: 11.6, end: 12.2 },
      { text: 'Speak soon.', start: 12.3, end: 13 },
    ];

    // Quiet, but it has neighbours — this is a real exchange.
    expect(dropHallucinations(segments, flat(0)).map((s) => s.text)).toEqual(
      segments.map((s) => s.text)
    );
  });

  it('keeps ordinary words even when isolated and silent', () => {
    const segments: AsrSegment[] = [
      { text: 'The invoice is attached.', start: 0, end: 2 },
      { text: 'Later.', start: 200, end: 201 },
    ];

    // Not a stock phrase, so the other two conditions never get consulted.
    expect(dropHallucinations(segments, flat(0))).toHaveLength(2);
  });

  it('requires isolation on both sides', () => {
    const segments: AsrSegment[] = [
      { text: 'So anyway.', start: 0, end: 2 },
      { text: 'you', start: 2.1, end: 2.4 },
      { text: 'Much later.', start: 300, end: 301 },
    ];

    // Isolated after but not before: something was being said right up to it.
    expect(dropHallucinations(segments, flat(0))).toHaveLength(3);
  });

  it('treats the file edges as isolated', () => {
    const only: AsrSegment[] = [{ text: 'Thanks for watching', start: 0, end: 3 }];

    expect(dropHallucinations(only, flat(0))).toEqual([]);
  });

  it('matches regardless of case and punctuation', () => {
    for (const text of ['You.', 'THANK YOU!', 'Bye-bye', '[Music]']) {
      const segments: AsrSegment[] = [
        { text, start: 0, end: 1 },
        { text: 'real speech here', start: 60, end: 62 },
      ];
      expect(dropHallucinations(segments, flat(0))).toHaveLength(1);
    }
  });

  it('honours the documented isolation boundary', () => {
    const at = (gap: number): AsrSegment[] => [
      { text: 'you', start: 0, end: 1 },
      { text: 'next', start: 1 + gap, end: 2 + gap },
    ];

    expect(dropHallucinations(at(ISOLATION_GAP - 0.1), flat(0))).toHaveLength(2);
    expect(dropHallucinations(at(ISOLATION_GAP + 0.1), flat(0))).toHaveLength(1);
  });

  it('returns the input unchanged when nothing is dropped', () => {
    const segments: AsrSegment[] = [{ text: 'Hello.', start: 0, end: 1 }];

    expect(dropHallucinations(segments, flat(0.2))).toBe(segments);
    expect(dropHallucinations([], flat(0))).toEqual([]);
  });
});

describe('rmsProbe', () => {
  it('measures the requested window, not the whole file', () => {
    const rate = 1000;
    const samples = new Float32Array(2 * rate);
    // Loud in the first second, silent in the second.
    for (let i = 0; i < rate; i += 1) samples[i] = i % 2 === 0 ? 0.5 : -0.5;

    const probe = rmsProbe(samples, rate);

    expect(probe(0, 1)).toBeCloseTo(0.5, 5);
    expect(probe(1, 2)).toBe(0);
  });

  it('returns 0 for a window outside the samples', () => {
    expect(rmsProbe(new Float32Array(100), 100)(5, 6)).toBe(0);
  });
});
