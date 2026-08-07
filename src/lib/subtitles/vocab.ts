import type { Word } from './types';

/**
 * Custom vocabulary: finding the words the model could not have known.
 *
 * The user supplies the terms — names, companies, industry vocabulary — and this
 * finds the places the transcript probably got them wrong, so they can be corrected
 * with find and replace instead of by reading 5,791 words looking for them.
 *
 * **Why phonetic rather than edit distance.** The real failures from the 39-minute
 * call, all of which are the word "Amadeus": `Amadius`, `Amadie's`, `ahmadiyya`.
 * Normalised edit distance puts "ahmadiyya" more than half a word away from
 * "Amadeus" — far outside any threshold that would not also match unrelated words.
 * But the speaker *said* Amadeus every time; the model heard the sounds and spelled
 * them differently. Comparing sound is the operation that matches the mistake.
 *
 * Soundex specifically because it is about thirty lines and its behaviour is
 * inspectable. It is not the best phonetic algorithm — Double Metaphone would do
 * better on exactly this class of word — but a suggester the user confirms one term
 * at a time can afford to be approximate, and an opaque dependency for this would
 * be a poor trade. Both signals are used, since they fail in different places:
 * `Amadius` and `Amadie's` share Amadeus's Soundex key, `ahmadiyya` does not, and
 * edit distance catches ordinary near-misses like `IATA` against `IATTA`.
 */

/** A word's letters and digits only. */
function core(text: string): string {
  return text.replaceAll(/[^\p{L}\p{N}]/gu, '');
}

const SOUNDEX_CODES: Record<string, string> = {
  b: '1',
  f: '1',
  p: '1',
  v: '1',
  c: '2',
  g: '2',
  j: '2',
  k: '2',
  q: '2',
  s: '2',
  x: '2',
  z: '2',
  d: '3',
  t: '3',
  l: '4',
  m: '5',
  n: '5',
  r: '6',
};

/**
 * Soundex key: first letter, then three consonant codes.
 *
 * Vowels and `h`/`w`/`y` are dropped after the first letter, and repeated codes
 * collapse — which is what makes different spellings of the same sound converge.
 */
export function soundex(text: string): string {
  const letters = core(text).toLowerCase().replaceAll(/[^a-z]/g, '');
  if (letters === '') return '';

  const first = letters[0]!;
  let key = first.toUpperCase();
  let previous = SOUNDEX_CODES[first] ?? '';

  for (const letter of letters.slice(1)) {
    const code = SOUNDEX_CODES[letter] ?? '';

    if (code !== '' && code !== previous) key += code;
    // `h` and `w` do not break a run of the same code; a vowel does.
    if (letter !== 'h' && letter !== 'w') previous = code;
    if (key.length === 4) break;
  }

  return key.padEnd(4, '0');
}

/** Levenshtein distance, for ordinary near-misses. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i += 1) {
    const row = [i, ...new Array<number>(b.length).fill(0)];

    for (let j = 1; j <= b.length; j += 1) {
      row[j] =
        a[i - 1] === b[j - 1]
          ? previous[j - 1]!
          : 1 + Math.min(previous[j - 1]!, previous[j]!, row[j - 1]!);
    }

    previous = row;
  }

  return previous[b.length]!;
}

/** Distance as a fraction of the longer word, so length does not dominate. */
export function similarity(a: string, b: string): number {
  const x = core(a).toLowerCase();
  const y = core(b).toLowerCase();
  const longest = Math.max(x.length, y.length);
  if (longest === 0) return 1;

  return 1 - editDistance(x, y) / longest;
}

/** Above this, two spellings are treated as the same intended word. */
export const SIMILARITY_THRESHOLD = 0.66;

export interface Suggestion {
  /** The vocabulary term the user supplied. */
  term: string;
  /** The spelling actually in the transcript. */
  found: string;
  /** How many times that spelling occurs. */
  count: number;
  /** Which signal fired, so the UI can say why it is suggesting this. */
  reason: 'phonetic' | 'spelling';
  similarity: number;
}

/**
 * Terms in the transcript that resemble a vocabulary entry without matching it.
 *
 * Exact matches are excluded: a word already spelled correctly is not a
 * suggestion, and listing it would bury the ones that need attention.
 */
export function suggestCorrections(
  words: Word[],
  vocabulary: string[]
): Suggestion[] {
  const terms = vocabulary.map((t) => t.trim()).filter(Boolean);
  if (terms.length === 0) return [];

  const counts = new Map<string, number>();
  for (const word of words) {
    const key = core(word.text);
    if (key.length < 3) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const suggestions: Suggestion[] = [];

  for (const term of terms) {
    const termKey = core(term).toLowerCase();
    const termSoundex = soundex(term);

    for (const [found, count] of counts) {
      if (found.toLowerCase() === termKey) continue;

      const score = similarity(term, found);
      const phonetic = termSoundex !== '' && soundex(found) === termSoundex;

      if (!phonetic && score < SIMILARITY_THRESHOLD) continue;

      suggestions.push({
        term,
        found,
        count,
        reason: phonetic ? 'phonetic' : 'spelling',
        similarity: score,
      });
    }
  }

  // Most occurrences first: fixing a term that appears eleven times is worth more
  // of the user's attention than one that appears once.
  return suggestions.sort(
    (a, b) => b.count - a.count || b.similarity - a.similarity
  );
}
