/**
 * CTC forced alignment: a trellis and a Viterbi backtrack.
 *
 * Pure — takes log-probabilities in, gives frame spans out. No model, no worker,
 * no DOM, which is what lets the mathematics be tested against hand-built
 * emissions where the right answer is known by construction.
 *
 * **What this is doing.** The acoustic model emits, per frame, a distribution
 * over its character vocabulary plus a blank. We already know *what* was said —
 * the transcript comes from Whisper — so the task is not recognition but
 * *alignment*: find the single highest-probability path through the frames that
 * spells the known transcript, allowing each character to occupy one or more
 * frames and allowing blanks anywhere between them. That path assigns every
 * character a frame span, and frame spans are timestamps.
 *
 * This is why alignment is cheap enough to redo after an edit: one
 * non-autoregressive forward pass per window, then this, which is O(frames ×
 * characters) of simple arithmetic.
 */

/** Log-probabilities, frame-major: `data[frame * vocabSize + token]`. */
export interface Emissions {
  data: Float32Array;
  frames: number;
  vocabSize: number;
}

/** One aligned token: the frames it occupies and how confident the path was. */
export interface TokenSpan {
  /** Index into the token sequence that was aligned. */
  tokenIndex: number;
  /** Vocabulary id. */
  token: number;
  startFrame: number;
  /** Exclusive. */
  endFrame: number;
  /** Mean per-frame probability across the span, 0..1. */
  score: number;
}

export interface AlignedSpan {
  startFrame: number;
  /** Exclusive. */
  endFrame: number;
  score: number;
}

function at(emissions: Emissions, frame: number, token: number): number {
  return emissions.data[frame * emissions.vocabSize + token] ?? -Infinity;
}

/**
 * Builds the alignment trellis.
 *
 * `trellis[t][j]` is the best achievable score for having emitted the first `j`
 * tokens using the first `t` frames. Two moves are allowed into any cell: stay on
 * the current token (consume a frame as a blank) or advance to the next token
 * (consume a frame as that token). Taking the max of the two is what makes this
 * Viterbi rather than a sum.
 *
 * Scores are log-probabilities, so they add rather than multiply — which is the
 * whole reason to work in log space: a product of thousands of probabilities
 * underflows to zero in float32, a sum of thousands of logs does not.
 */
export function buildTrellis(
  emissions: Emissions,
  tokens: number[],
  blankId: number
): Float32Array {
  const T = emissions.frames;
  const N = tokens.length;
  // (T+1) x (N+1), padded so the boundary conditions need no special-casing.
  const trellis = new Float32Array((T + 1) * (N + 1)).fill(-Infinity);
  const idx = (t: number, j: number) => t * (N + 1) + j;

  // Zero tokens emitted using zero frames is the free starting point.
  trellis[idx(0, 0)] = 0;

  // Emitting nothing while consuming frames means every frame was blank.
  for (let t = 1; t <= T; t += 1) {
    trellis[idx(t, 0)] =
      trellis[idx(t - 1, 0)]! + at(emissions, t - 1, blankId);
  }

  for (let t = 1; t <= T; t += 1) {
    // A token cannot be emitted before its frame exists, and there is no point
    // considering more tokens than frames seen so far.
    const maxJ = Math.min(N, t);
    for (let j = 1; j <= maxJ; j += 1) {
      const stay = trellis[idx(t - 1, j)]! + at(emissions, t - 1, blankId);
      const advance =
        trellis[idx(t - 1, j - 1)]! + at(emissions, t - 1, tokens[j - 1]!);

      trellis[idx(t, j)] = Math.max(stay, advance);
    }
  }

  return trellis;
}

/**
 * Walks the trellis backwards to recover the path, then reports one span per
 * token.
 *
 * Backtracking rather than recording choices forward costs one extra comparison
 * per cell and saves a second `T × N` array, which matters when a 30-second
 * window is 1,500 frames by several hundred characters.
 */
export function backtrack(
  emissions: Emissions,
  tokens: number[],
  blankId: number,
  trellis: Float32Array
): TokenSpan[] {
  const T = emissions.frames;
  const N = tokens.length;
  if (N === 0 || T === 0) return [];

  const idx = (t: number, j: number) => t * (N + 1) + j;

  /** Frames attributed to each token, collected back-to-front. */
  const frames: number[][] = Array.from({ length: N }, () => []);
  const logProbs: number[][] = Array.from({ length: N }, () => []);

  let t = T;
  let j = N;

  while (t > 0 && j > 0) {
    const stay = trellis[idx(t - 1, j)]! + at(emissions, t - 1, blankId);
    const advance =
      trellis[idx(t - 1, j - 1)]! + at(emissions, t - 1, tokens[j - 1]!);

    if (advance >= stay) {
      // Frame t-1 emitted token j-1.
      frames[j - 1]!.push(t - 1);
      logProbs[j - 1]!.push(at(emissions, t - 1, tokens[j - 1]!));
      j -= 1;
    }
    t -= 1;
  }

  return tokens.map((token, tokenIndex) => {
    const owned = frames[tokenIndex]!;
    const probs = logProbs[tokenIndex]!;

    if (owned.length === 0) {
      // The path never emitted this token — possible when the transcript does
      // not match the audio. Report an empty span rather than inventing one; the
      // caller decides whether that fails the window.
      return { tokenIndex, token, startFrame: 0, endFrame: 0, score: 0 };
    }

    const startFrame = Math.min(...owned);
    const endFrame = Math.max(...owned) + 1;
    const meanLogProb = probs.reduce((a, b) => a + b, 0) / probs.length;

    return {
      tokenIndex,
      token,
      startFrame,
      endFrame,
      score: Math.exp(meanLogProb),
    };
  });
}

/** Runs the full alignment for one token sequence. */
export function alignTokens(
  emissions: Emissions,
  tokens: number[],
  blankId: number
): TokenSpan[] {
  return backtrack(
    emissions,
    tokens,
    blankId,
    buildTrellis(emissions, tokens, blankId)
  );
}

/**
 * Merges token spans into word spans.
 *
 * `wordTokenCounts` says how many tokens each word contributed, in order, so this
 * needs no knowledge of the vocabulary or of how words were split — the caller
 * owns tokenisation and this owns arithmetic.
 *
 * A word whose tokens were all skipped by the path gets a zero-length span at the
 * previous word's end, keeping the sequence monotonic instead of leaving a hole
 * at time zero that would sort to the front of the transcript.
 *
 * `leadingSkips` says how many tokens at the head of each group are word delimiters
 * rather than characters. They still advance the cursor but are excluded from the
 * span, because a delimiter's frames are the silence before the word.
 */
export function mergeTokensToWords(
  spans: TokenSpan[],
  wordTokenCounts: number[],
  leadingSkips: number[] = []
): AlignedSpan[] {
  const words: AlignedSpan[] = [];
  let cursor = 0;
  let lastEnd = 0;

  for (const [index, count] of wordTokenCounts.entries()) {
    // The cursor advances over the whole group, including any leading word
    // delimiter, or every later word would be off by one. But the delimiter is
    // excluded from the span itself: its frames *are* the pause before the word, so
    // including them made every word start at the end of the previous one — measured
    // at 350–450 ms early by the M2 gate.
    const skip = Math.min(leadingSkips[index] ?? 0, count);
    const owned = spans
      .slice(cursor + skip, cursor + count)
      .filter((s) => s.endFrame > s.startFrame);
    cursor += count;

    if (owned.length === 0) {
      words.push({ startFrame: lastEnd, endFrame: lastEnd, score: 0 });
      continue;
    }

    const startFrame = Math.min(...owned.map((s) => s.startFrame));
    const endFrame = Math.max(...owned.map((s) => s.endFrame));
    lastEnd = endFrame;

    words.push({
      startFrame,
      endFrame,
      // The weakest token in a word is what makes the word's timing suspect, so
      // the word inherits the minimum rather than an average that would hide it.
      score: Math.min(...owned.map((s) => s.score)),
    });
  }

  return words;
}

/**
 * Converts a frame span to seconds.
 *
 * `frameSeconds` is the model's stride — 20 ms for wav2vec2 at 16 kHz, since it
 * downsamples by 320 samples. `offset` shifts the window back into absolute
 * time. `calibration` is a constant added to both ends: CTC assigns a character
 * to the frames where the model is most confident about it, which tends to sit
 * slightly *after* the acoustic onset, and a single measured constant corrects
 * that better than any per-word heuristic.
 */
export function spanToSeconds(
  span: AlignedSpan,
  frameSeconds: number,
  offset = 0,
  calibration = 0
): { start: number; end: number } {
  return {
    start: Math.max(0, span.startFrame * frameSeconds + offset + calibration),
    end: Math.max(0, span.endFrame * frameSeconds + offset + calibration),
  };
}
