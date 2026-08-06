import { describe, expect, it } from 'vitest';

import { SILENCE_RMS } from '@/lib/media/decode-pcm';

import type { SpeechRegion } from './types';
import { dropSilentRegions } from './vad-regions';

const RATE = 16_000;

/** `seconds` of audio at a constant amplitude, written into `into` at `at`. */
function fill(
  into: Float32Array,
  at: number,
  seconds: number,
  amplitude: number
): void {
  const from = Math.floor(at * RATE);
  const to = Math.floor((at + seconds) * RATE);
  for (let i = from; i < to && i < into.length; i += 1) {
    // Alternating sign so RMS reflects the amplitude rather than a DC offset.
    into[i] = i % 2 === 0 ? amplitude : -amplitude;
  }
}

describe('dropSilentRegions', () => {
  it('drops a near-silent lead-in while keeping real speech', () => {
    // The fixture's shape: quiet noise at the start, speech later.
    const samples = new Float32Array(10 * RATE);
    fill(samples, 0, 2, SILENCE_RMS / 10);
    fill(samples, 5, 3, 0.15);

    const regions: SpeechRegion[] = [
      { start: 0, end: 2 },
      { start: 5, end: 8 },
    ];

    expect(dropSilentRegions(regions, samples, RATE)).toEqual([
      { start: 5, end: 8 },
    ]);
  });

  it('keeps every region when all carry energy', () => {
    const samples = new Float32Array(4 * RATE);
    fill(samples, 0, 4, 0.1);
    const regions: SpeechRegion[] = [
      { start: 0, end: 1 },
      { start: 2, end: 3 },
    ];

    // Identity, so the no-op case allocates nothing.
    expect(dropSilentRegions(regions, samples, RATE)).toBe(regions);
  });

  it('drops a region that falls entirely outside the samples', () => {
    const samples = new Float32Array(RATE);
    fill(samples, 0, 1, 0.1);

    expect(
      dropSilentRegions([{ start: 5, end: 6 }], samples, RATE)
    ).toEqual([]);
  });

  it('keeps a quiet word that clears the threshold', () => {
    // Softly spoken, but not silent: this must survive.
    const samples = new Float32Array(2 * RATE);
    fill(samples, 0, 2, SILENCE_RMS * 3);

    expect(
      dropSilentRegions([{ start: 0, end: 2 }], samples, RATE)
    ).toHaveLength(1);
  });

  it('returns the input unchanged for an empty region list', () => {
    const regions: SpeechRegion[] = [];
    expect(dropSilentRegions(regions, new Float32Array(RATE), RATE)).toBe(
      regions
    );
  });

  it('does not divide by an invalid sample rate', () => {
    const regions: SpeechRegion[] = [{ start: 0, end: 1 }];
    expect(dropSilentRegions(regions, new Float32Array(RATE), 0)).toBe(regions);
  });
});
