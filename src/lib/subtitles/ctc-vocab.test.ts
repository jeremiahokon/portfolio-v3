import { describe, expect, it } from 'vitest';

import {
  type CtcVocabulary,
  makeVocabulary,
  tokenCountsPerWord,
  tokenizeForCtc,
} from './ctc-vocab';

/** The real wav2vec2-base-960h vocabulary, as published. */
const RAW: Record<string, number> = {
  '<pad>': 0,
  '<s>': 1,
  '</s>': 2,
  '<unk>': 3,
  '|': 4,
  E: 5,
  T: 6,
  A: 7,
  O: 8,
  N: 9,
  I: 10,
  H: 11,
  S: 12,
  R: 13,
  D: 14,
  L: 15,
  U: 16,
  M: 17,
  W: 18,
  C: 19,
  F: 20,
  G: 21,
  Y: 22,
  P: 23,
  B: 24,
  V: 25,
  K: 26,
  "'": 27,
  X: 28,
  J: 29,
  Q: 30,
  Z: 31,
};

const vocab: CtcVocabulary = makeVocabulary(RAW);

describe('makeVocabulary', () => {
  it('finds the blank and the delimiter', () => {
    expect(vocab.blankId).toBe(0);
    expect(vocab.delimiterId).toBe(4);
  });

  it('refuses a vocabulary with no blank rather than aligning against nothing', () => {
    expect(() => makeVocabulary({ A: 1 })).toThrow(/missing/);
  });
});

describe('tokenizeForCtc', () => {
  it('maps letters to ids, uppercasing first', () => {
    const { tokens, words } = tokenizeForCtc(['cat'], vocab);

    expect(tokens).toEqual([RAW.C, RAW.A, RAW.T]);
    expect(words[0]).toEqual({ wordIndex: 0, from: 0, to: 3 });
  });

  it('puts a delimiter between words but not before the first', () => {
    const { tokens } = tokenizeForCtc(['a', 'b'], vocab);

    expect(tokens).toEqual([RAW.A, RAW['|'], RAW.B]);
  });

  it('keeps apostrophes, which the vocabulary has', () => {
    expect(tokenizeForCtc(["don't"], vocab).tokens).toEqual([
      RAW.D,
      RAW.O,
      RAW.N,
      RAW["'"],
      RAW.T,
    ]);
  });

  it('drops punctuation the model has no symbol for', () => {
    expect(tokenizeForCtc(['cat.'], vocab).tokens).toEqual([
      RAW.C,
      RAW.A,
      RAW.T,
    ]);
  });

  it('reports a digits-only word as unalignable rather than mangling it', () => {
    // The vocabulary has no digits at all, so "2026" has no representation.
    // Substituting <unk> would let it be aligned to some frames and lend a bogus
    // timing an air of legitimacy.
    const result = tokenizeForCtc(['2026'], vocab);

    expect(result.unalignable).toEqual([0]);
    expect(result.tokens).toEqual([]);
    expect(result.words).toEqual([]);
  });

  it('keeps the letters of a mixed word and still aligns it', () => {
    // "3rd" keeps "RD" — imperfect, but the word is genuinely present in the
    // acoustics and partial letters place it far better than a fallback would.
    const result = tokenizeForCtc(['3rd'], vocab);

    expect(result.tokens).toEqual([RAW.R, RAW.D]);
    expect(result.unalignable).toEqual([]);
  });

  it('aligns acronyms normally, because they are just letters', () => {
    expect(tokenizeForCtc(['API'], vocab).tokens).toEqual([
      RAW.A,
      RAW.P,
      RAW.I,
    ]);
  });

  it('skips unalignable words without breaking the delimiters around them', () => {
    const { tokens, words, unalignable } = tokenizeForCtc(
      ['call', '0803', 'now'],
      vocab
    );

    expect(unalignable).toEqual([1]);
    // No double delimiter where the digits were dropped.
    expect(tokens.filter((t) => t === RAW['|'])).toHaveLength(1);
    expect(words.map((w) => w.wordIndex)).toEqual([0, 2]);
  });

  it('handles an empty input', () => {
    expect(tokenizeForCtc([], vocab)).toEqual({
      tokens: [],
      words: [],
      unalignable: [],
    });
  });

  it('reports every word as unalignable when none can be represented', () => {
    const result = tokenizeForCtc(['123', '456'], vocab);

    expect(result.unalignable).toEqual([0, 1]);
    expect(result.tokens).toEqual([]);
  });
});

describe('tokenCountsPerWord', () => {
  it('accounts the delimiter to the word that follows it', () => {
    // Without this the spans after the first would all be off by one.
    const tokenized = tokenizeForCtc(['ab', 'cd'], vocab);

    expect(tokenCountsPerWord(tokenized)).toEqual([2, 3]);
  });

  it('sums to the full token sequence, so no token is unaccounted for', () => {
    const tokenized = tokenizeForCtc(['one', 'two', 'three'], vocab);
    const total = tokenCountsPerWord(tokenized).reduce((a, b) => a + b, 0);

    expect(total).toBe(tokenized.tokens.length);
  });

  it('is empty for no words', () => {
    expect(tokenCountsPerWord(tokenizeForCtc([], vocab))).toEqual([]);
  });
});
