import { describe, expect, it } from 'vitest';

import { DEFAULT_VAD as V, regionsFromProbabilities } from './vad-regions';

/** 32 ms per frame, matching Silero's 512 samples at 16 kHz. */
const FRAME = 0.032;

/** Builds a probability series from [value, frameCount] runs. */
function series(...runs: Array<[number, number]>): number[] {
  return runs.flatMap(([value, count]) =>
    Array.from({ length: count }, () => value)
  );
}

const duration = (probabilities: number[]) => probabilities.length * FRAME;

function detect(probabilities: number[], thresholds = V) {
  return regionsFromProbabilities(
    probabilities,
    FRAME,
    duration(probabilities),
    thresholds
  );
}

describe('regionsFromProbabilities', () => {
  it('finds nothing in silence', () => {
    expect(detect(series([0.02, 100]))).toEqual([]);
  });

  it('finds one region in continuous speech', () => {
    expect(detect(series([0.9, 100]))).toHaveLength(1);
  });

  it('closes a region at the last speech frame, not after the silence', () => {
    // 30 frames of speech (0.96 s), then silence.
    const regions = detect(series([0.9, 30], [0.01, 60]));

    expect(regions).toHaveLength(1);
    // 30 * 0.032 = 0.96, plus the trailing pad.
    expect(regions[0]!.end).toBeCloseTo(0.96 + V.pad, 5);
  });

  it('splits on a silence longer than minSilence', () => {
    const regions = detect(series([0.9, 30], [0.01, 30], [0.9, 30]));

    expect(regions).toHaveLength(2);
    expect(regions[1]!.start).toBeGreaterThan(regions[0]!.end);
  });

  it('does not split on a brief dip, such as a plosive', () => {
    // Two frames of quiet is 64 ms, under the 100 ms minSilence.
    expect(detect(series([0.9, 30], [0.01, 2], [0.9, 30]))).toHaveLength(1);
  });

  it('rides through a mid-word dip between the two thresholds', () => {
    // 0.4 is below speechStart but at or above speechEnd, so hysteresis holds
    // the region open. A single-threshold detector would chatter here.
    expect(detect(series([0.9, 20], [0.4, 20], [0.9, 20]))).toHaveLength(1);
  });

  it('does not start a region on a value between the thresholds', () => {
    expect(detect(series([0.4, 100]))).toEqual([]);
  });

  it('discards a region shorter than minSpeech', () => {
    // 4 frames is 128 ms, under the 250 ms minSpeech.
    expect(detect(series([0.9, 4], [0.01, 60]))).toEqual([]);
  });

  it('closes an open region when the audio ends mid-speech', () => {
    // Losing this would drop the final sentence of every file that does not end
    // in silence — which is most of them.
    const regions = detect(series([0.01, 10], [0.9, 40]));

    expect(regions).toHaveLength(1);
    expect(regions[0]!.end).toBeGreaterThan(regions[0]!.start);
  });

  it('pads each region on both sides', () => {
    const unpadded = detect(series([0.01, 20], [0.9, 40], [0.01, 40]), {
      ...V,
      pad: 0,
    });
    const padded = detect(series([0.01, 20], [0.9, 40], [0.01, 40]));

    expect(padded[0]!.start).toBeCloseTo(unpadded[0]!.start - V.pad, 5);
    expect(padded[0]!.end).toBeCloseTo(unpadded[0]!.end + V.pad, 5);
  });

  it('never pads outside the audio', () => {
    const probabilities = series([0.9, 40]);
    const regions = detect(probabilities);

    expect(regions[0]!.start).toBeGreaterThanOrEqual(0);
    expect(regions[0]!.end).toBeLessThanOrEqual(duration(probabilities));
  });

  it('returns regions in order, each with positive length', () => {
    const regions = detect(
      series([0.9, 30], [0.01, 30], [0.9, 30], [0.01, 30], [0.9, 30])
    );

    expect(regions.length).toBeGreaterThan(1);
    for (let i = 0; i < regions.length; i += 1) {
      expect(regions[i]!.end).toBeGreaterThan(regions[i]!.start);
      if (i > 0) {
        expect(regions[i]!.start).toBeGreaterThanOrEqual(regions[i - 1]!.start);
      }
    }
  });

  it('handles an empty series', () => {
    expect(detect([])).toEqual([]);
  });
});
