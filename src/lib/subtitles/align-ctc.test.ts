import { describe, expect, it } from 'vitest';

import {
  alignTokens,
  buildTrellis,
  type Emissions,
  mergeTokensToWords,
  spanToSeconds,
} from './align-ctc';

/**
 * Builds emissions from a per-frame "winner" script.
 *
 * Each entry names the token the model is confident about in that frame. Everything
 * else gets a low log-probability, so the correct path is known by construction
 * and the test asserts against arithmetic rather than against a model.
 */
function emissionsFrom(
  script: number[],
  vocabSize: number,
  confident = Math.log(0.9),
  other = Math.log(0.01)
): Emissions {
  const data = new Float32Array(script.length * vocabSize).fill(other);
  script.forEach((winner, frame) => {
    data[frame * vocabSize + winner] = confident;
  });

  return { data, frames: script.length, vocabSize };
}

const BLANK = 0;

describe('buildTrellis', () => {
  it('scores the empty-token path as all blanks', () => {
    const emissions = emissionsFrom([BLANK, BLANK, BLANK], 3);
    const trellis = buildTrellis(emissions, [], BLANK);

    // 3 frames of blank at log(0.9) each.
    expect(trellis[3]).toBeCloseTo(3 * Math.log(0.9), 5);
  });

  it('leaves unreachable cells at -Infinity', () => {
    // Two tokens cannot both be emitted using one frame.
    const emissions = emissionsFrom([1], 3);
    const trellis = buildTrellis(emissions, [1, 2], BLANK);
    const N = 2;

    expect(trellis[1 * (N + 1) + 2]).toBe(-Infinity);
  });
});

describe('alignTokens', () => {
  it('places one token on the frame where the model is confident', () => {
    // blank, blank, "1", blank
    const emissions = emissionsFrom([BLANK, BLANK, 1, BLANK], 3);
    const [span] = alignTokens(emissions, [1], BLANK);

    expect(span!.startFrame).toBe(2);
    expect(span!.endFrame).toBe(3);
    expect(span!.score).toBeCloseTo(0.9, 5);
  });

  it('places tokens in order across their confident frames', () => {
    // "1" at frame 1, "2" at frame 3.
    const emissions = emissionsFrom([BLANK, 1, BLANK, 2, BLANK], 3);
    const spans = alignTokens(emissions, [1, 2], BLANK);

    expect(spans[0]!.startFrame).toBe(1);
    expect(spans[0]!.endFrame).toBe(2);
    expect(spans[1]!.startFrame).toBe(3);
    expect(spans[1]!.endFrame).toBe(4);
  });

  it('lets a token span several frames when it is held', () => {
    const emissions = emissionsFrom([BLANK, 1, 1, 1, BLANK], 3);
    const [span] = alignTokens(emissions, [1, 1, 1], BLANK);

    expect(span!.startFrame).toBe(1);
    // Three repeated tokens across three confident frames.
    const spans = alignTokens(emissions, [1, 1, 1], BLANK);
    expect(spans.map((s) => s.startFrame)).toEqual([1, 2, 3]);
  });

  it('never lets spans go backwards', () => {
    const emissions = emissionsFrom([1, 2, 3, 1, 2, 3], 4);
    const spans = alignTokens(emissions, [1, 2, 3, 1, 2, 3], BLANK);

    for (let i = 1; i < spans.length; i += 1) {
      expect(spans[i]!.startFrame).toBeGreaterThanOrEqual(
        spans[i - 1]!.startFrame
      );
    }
  });

  it('assigns every token a distinct frame when frames exactly suffice', () => {
    const emissions = emissionsFrom([1, 2, 3], 4);
    const spans = alignTokens(emissions, [1, 2, 3], BLANK);

    expect(spans.map((s) => [s.startFrame, s.endFrame])).toEqual([
      [0, 1],
      [1, 2],
      [2, 3],
    ]);
  });

  it('returns nothing for no tokens or no frames', () => {
    expect(alignTokens(emissionsFrom([1, 2], 3), [], BLANK)).toEqual([]);
    expect(
      alignTokens(
        { data: new Float32Array(), frames: 0, vocabSize: 3 },
        [1],
        BLANK
      )
    ).toEqual([]);
  });

  it('reports a low score when the model never supported the token', () => {
    // The model is confident about token 2 throughout; we force-align token 1.
    const emissions = emissionsFrom([2, 2, 2, 2], 3);
    const [span] = alignTokens(emissions, [1], BLANK);

    // It still has to place it somewhere — that is what forced alignment means —
    // but the score must reveal that the acoustics did not support it.
    expect(span!.score).toBeLessThan(0.1);
  });

  it('scores a well-supported alignment high', () => {
    const emissions = emissionsFrom([BLANK, 1, 2, BLANK], 3);
    const spans = alignTokens(emissions, [1, 2], BLANK);

    for (const span of spans) expect(span.score).toBeGreaterThan(0.8);
  });
});

describe('mergeTokensToWords', () => {
  const spans = [
    { tokenIndex: 0, token: 1, startFrame: 0, endFrame: 2, score: 0.9 },
    { tokenIndex: 1, token: 2, startFrame: 2, endFrame: 4, score: 0.8 },
    { tokenIndex: 2, token: 3, startFrame: 6, endFrame: 8, score: 0.7 },
  ];

  it('spans a word from its first token to its last', () => {
    const words = mergeTokensToWords(spans, [2, 1]);

    expect(words[0]).toMatchObject({ startFrame: 0, endFrame: 4 });
    expect(words[1]).toMatchObject({ startFrame: 6, endFrame: 8 });
  });

  it('takes the weakest token as the word score', () => {
    // An average would hide one badly-supported character inside a long word.
    expect(mergeTokensToWords(spans, [2, 1])[0]!.score).toBeCloseTo(0.8, 5);
  });

  it('keeps a skipped word monotonic instead of dropping it to zero', () => {
    const withSkip = [
      spans[0]!,
      { tokenIndex: 1, token: 2, startFrame: 0, endFrame: 0, score: 0 },
      spans[2]!,
    ];
    const words = mergeTokensToWords(withSkip, [1, 1, 1]);

    // A hole at time zero would sort to the front of the transcript.
    expect(words[1]!.startFrame).toBe(2);
    expect(words[1]!.endFrame).toBe(2);
    expect(words[1]!.score).toBe(0);
  });

  it('handles an empty input', () => {
    expect(mergeTokensToWords([], [])).toEqual([]);
  });
});

describe('spanToSeconds', () => {
  const span = { startFrame: 10, endFrame: 25, score: 0.9 };

  it('converts frames at the model stride', () => {
    // wav2vec2 strides 20 ms per frame.
    expect(spanToSeconds(span, 0.02)).toEqual({ start: 0.2, end: 0.5 });
  });

  it('shifts by the window offset', () => {
    expect(spanToSeconds(span, 0.02, 30)).toEqual({ start: 30.2, end: 30.5 });
  });

  it('applies the calibration constant to both ends', () => {
    const shifted = spanToSeconds(span, 0.02, 0, -0.02);

    expect(shifted.start).toBeCloseTo(0.18, 6);
    expect(shifted.end).toBeCloseTo(0.48, 6);
  });

  it('never produces a negative time', () => {
    // A negative calibration at the very start of a file must clamp.
    expect(
      spanToSeconds({ startFrame: 0, endFrame: 1, score: 1 }, 0.02, 0, -0.5)
        .start
    ).toBe(0);
  });
});

describe('the alignment as a whole', () => {
  it('recovers known word timings from a constructed utterance', () => {
    // Vocabulary: 0 blank, 1 'c', 2 'a', 3 't', 4 's'. "cat" then "sat", with a
    // silent gap between them. 20 ms frames.
    const script = [
      BLANK,
      BLANK, // 0.00 - 0.04 silence
      1,
      2,
      3, // "cat" spans frames 2-4 → 0.04 - 0.10
      BLANK,
      BLANK,
      BLANK, // gap
      4,
      2,
      3, // "sat" spans frames 8-10 → 0.16 - 0.22
      BLANK,
    ];
    const emissions = emissionsFrom(script, 5);
    const spans = alignTokens(emissions, [1, 2, 3, 4, 2, 3], BLANK);
    const words = mergeTokensToWords(spans, [3, 3]);

    const cat = spanToSeconds(words[0]!, 0.02);
    const sat = spanToSeconds(words[1]!, 0.02);

    expect(cat.start).toBeCloseTo(0.04, 6);
    expect(cat.end).toBeCloseTo(0.1, 6);
    expect(sat.start).toBeCloseTo(0.16, 6);
    expect(sat.end).toBeCloseTo(0.22, 6);
    // The gap between the words is preserved, which is the whole point: this is
    // the slack that estimated timings never produce.
    expect(sat.start - cat.end).toBeCloseTo(0.06, 6);
  });
});
