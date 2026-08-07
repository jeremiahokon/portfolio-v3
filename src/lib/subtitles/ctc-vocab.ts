/**
 * Turning a transcript into the character tokens the CTC aligner can consume.
 *
 * **wav2vec2-base-960h has a 32-symbol vocabulary: `<pad>`, `<s>`, `</s>`,
 * `<unk>`, `|`, `'` and the 26 uppercase letters. There are no digits.** That is
 * not a limitation to work around here, it is a fact with a consequence: a word
 * like "2026" or "14:30" has *no* representation in this model's output space and
 * therefore cannot be force-aligned at all.
 *
 * The risk register predicted the aligner would be "characteristically bad" at
 * digits and acronyms. Reading the actual vocabulary sharpens that: digits are not
 * aligned badly, they are unalignable, and the only honest handling is to detect
 * it and keep the estimated timing for those words rather than emit a confident
 * number that came from nowhere. Acronyms are fine — "API" is three letters the
 * model knows — provided the speaker says the letters.
 *
 * Pure and vocabulary-driven: the map is loaded from the model's own `vocab.json`
 * rather than hardcoded, so a different CTC checkpoint needs no code change.
 */

/** `<pad>` doubles as the CTC blank in this checkpoint, and it is id 0. */
export const BLANK_TOKEN = '<pad>';
/** Separates words. The aligner needs it: it is where inter-word silence goes. */
export const WORD_DELIMITER = '|';

export interface CtcVocabulary {
  /** Symbol → id, straight from the model's `vocab.json`. */
  ids: Record<string, number>;
  blankId: number;
  delimiterId: number;
}

export function makeVocabulary(ids: Record<string, number>): CtcVocabulary {
  const blankId = ids[BLANK_TOKEN];
  const delimiterId = ids[WORD_DELIMITER];

  if (blankId === undefined || delimiterId === undefined) {
    throw new Error(
      `CTC vocabulary is missing ${BLANK_TOKEN} or ${WORD_DELIMITER}; got ${Object.keys(ids).length} symbols`
    );
  }

  return { ids, blankId, delimiterId };
}

/** Where one word's tokens live within the flattened sequence. */
export interface WordTokens {
  /** Index of the word in the input list. */
  wordIndex: number;
  /** Inclusive start index into `tokens`. */
  from: number;
  /** Exclusive end index into `tokens`. */
  to: number;
}

export interface Tokenized {
  tokens: number[];
  /** One entry per word that could be represented at all, in order. */
  words: WordTokens[];
  /**
   * Indices of words with no representable characters — digits, emoji, CJK.
   * These keep whatever timing they already had; see the note at the top.
   */
  unalignable: number[];
}

/**
 * Maps display text onto vocabulary ids.
 *
 * Uppercases, because the vocabulary is uppercase. Drops any character the model
 * has no symbol for rather than substituting `<unk>`: an `<unk>` would be aligned
 * to *some* frames and lend a bogus timing an air of legitimacy, whereas dropping
 * it makes the word visibly unalignable and routes it to the fallback.
 */
export function tokenizeForCtc(
  words: string[],
  vocabulary: CtcVocabulary
): Tokenized {
  const tokens: number[] = [];
  const out: WordTokens[] = [];
  const unalignable: number[] = [];

  words.forEach((word, wordIndex) => {
    const ids = [...word.toUpperCase()]
      .map((character) => vocabulary.ids[character])
      .filter(
        (id): id is number => id !== undefined && id !== vocabulary.delimiterId
      );

    if (ids.length === 0) {
      unalignable.push(wordIndex);

      return;
    }

    // The delimiter goes *between* words only. A leading one would give the
    // aligner a word boundary to explain before any speech has happened.
    if (out.length > 0) tokens.push(vocabulary.delimiterId);

    const from = tokens.length;
    tokens.push(...ids);
    out.push({ wordIndex, from, to: tokens.length });
  });

  return { tokens, words: out, unalignable };
}

/**
 * Token counts per aligned word, including the delimiters that precede them.
 *
 * `mergeTokensToWords` walks the token sequence in order, so a delimiter has to be
 * accounted to some word or every span after the first would be off by one. It is
 * counted against the word that follows purely so that bookkeeping works.
 *
 * **It must not contribute to that word's time span** — see
 * `leadingDelimitersPerWord`. An earlier version of this comment argued the opposite,
 * that "the silence before a word belongs to that word's approach", and the M2 gate
 * measured what that cost: word *starts* landed 350–450 ms early because the
 * delimiter's frames are exactly the inter-word pause, so every word began at the end
 * of the previous one. Ends were fine; only 7 of 54 starts were within the 200 ms
 * collar. It was a plausible sentence about subtitles and a wrong statement about
 * where a word starts.
 */
export function tokenCountsPerWord(tokenized: Tokenized): number[] {
  return tokenized.words.map((word, index) =>
    index === 0 ? word.to - word.from : word.to - word.from + 1
  );
}

/**
 * How many tokens at the head of each word's group are delimiters, not characters.
 *
 * Always 0 for the first word and 1 for the rest, given how `tokenizeForCtc` emits
 * them — but derived rather than assumed, so a change to the tokenisation cannot
 * silently reintroduce the 350 ms error this exists to prevent.
 */
export function leadingDelimitersPerWord(tokenized: Tokenized): number[] {
  return tokenized.words.map((_, index) => (index === 0 ? 0 : 1));
}
