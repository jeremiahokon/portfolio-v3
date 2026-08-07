/**
 * Longest common subsequence over token lists, returning **index pairs**.
 *
 * Extracted from `score.ts`, which has used an LCS since the M2 scorer to pair
 * reference words with hypothesis words. That version returns matched objects and
 * discards where they came from, which is all a score needs. The editor needs the
 * indices: to apply an edit it has to know not just which words survived but which
 * ones were inserted and deleted around them.
 *
 * No behaviour change to the scorer — `pairWordsByText` now maps these pairs back
 * to its own objects.
 */

/**
 * Indices of a longest common subsequence, as `[indexInA, indexInB]` pairs in
 * increasing order.
 *
 * Quadratic in time and space. The scorer runs it over a ~120-word reference; the
 * editor runs it over the tokens of a single cue, rarely more than twenty. Neither
 * is anywhere near the size where an O(nd) algorithm would earn its complexity.
 */
export function lcsIndexPairs(
  a: readonly string[],
  b: readonly string[]
): Array<[number, number]> {
  const table: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0)
  );

  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i]![j]! =
        a[i] === b[j]
          ? table[i + 1]![j + 1]! + 1
          : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
    }
  }

  const pairs: Array<[number, number]> = [];
  let i = 0;
  let j = 0;

  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      pairs.push([i, j]);
      i += 1;
      j += 1;
    } else if (table[i + 1]![j]! >= table[i]![j + 1]!) {
      i += 1;
    } else {
      j += 1;
    }
  }

  return pairs;
}

/**
 * The comparison key for pairing words.
 *
 * Case- and punctuation-insensitive, and that is load-bearing rather than
 * incidental. The most common edit by far is fixing capitalisation or adding a
 * comma — "hello" to "Hello,". Under this key the token still *matches*, so it is
 * treated as a surviving word whose text changed rather than as a deletion and an
 * insertion, and it keeps its measured timing untouched for free.
 */
export function tokenKey(text: string): string {
  return text.toLowerCase().replaceAll(/[^\p{L}\p{N}]/gu, '');
}
