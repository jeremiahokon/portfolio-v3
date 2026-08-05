import type { Cue, Word } from './types';

/**
 * The editing operations, as pure functions over `(Word[], Cue[])`.
 *
 * Every one of them exists to protect a single invariant from the data model:
 * **words own timing, cues own grouping, and the two are never confused.** That
 * is what makes editing text free and re-segmenting lossless.
 *
 * Consequences that are easy to state and easy to violate accidentally:
 *
 * - Editing text must leave `start` and `end` *byte-identical*, not merely close.
 * - Split and merge rewrite index ranges only. They never invent, drop, reorder
 *   or re-time a word, so any sequence of them round-trips.
 * - Dragging a boundary is the one operation that writes timing, and it marks the
 *   word `timeLocked` so no later machine pass can quietly undo the human.
 */

/**
 * Replaces a word's text.
 *
 * Sets `edited` so a later re-alignment knows which region to revisit, and
 * preserves `origText` so the change stays diffable. **Does not touch timing** —
 * that is the whole point, and there is a test asserting the numbers are
 * identical rather than approximately equal.
 */
export function editWordText(
  words: Word[],
  index: number,
  text: string
): Word[] {
  const word = words[index];
  if (!word || word.text === text) return words;

  const next = [...words];
  next[index] = { ...word, text, edited: true };

  return next;
}

/** Marks a word's timing as human-authored, so machines leave it alone. */
export function lockWord(words: Word[], index: number, locked = true): Word[] {
  const word = words[index];
  if (!word || word.timeLocked === locked) return words;

  const next = [...words];
  next[index] = { ...word, timeLocked: locked };

  return next;
}

/**
 * Moves one boundary of a word.
 *
 * The only operation that writes timing, so it locks the word. Clamped against
 * its neighbours rather than allowed to cross them: a word ending after the next
 * one starts is not a preference, it is invalid data.
 */
export function moveWordBoundary(
  words: Word[],
  index: number,
  edge: 'start' | 'end',
  seconds: number
): Word[] {
  const word = words[index];
  if (!word) return words;

  const previous = words[index - 1];
  const following = words[index + 1];

  const value =
    edge === 'start'
      ? Math.min(Math.max(seconds, previous?.end ?? 0), word.end)
      : Math.max(
          Math.min(seconds, following?.start ?? Number.POSITIVE_INFINITY),
          word.start
        );

  if (value === word[edge]) return words;

  const next = [...words];
  next[index] = { ...word, [edge]: value, timeLocked: true };

  return next;
}

/**
 * Splits a cue before `wordIndex`.
 *
 * Rewrites index ranges only. Line breaks are recomputed by the caller through
 * the normal cue-building path rather than carried over, because a break chosen
 * for a longer cue is rarely right for either half.
 */
export function splitCue(
  cues: Cue[],
  cueIndex: number,
  wordIndex: number
): Cue[] {
  const cue = cues[cueIndex];
  if (!cue) return cues;
  // Splitting at either edge would produce an empty cue, which is not a split.
  if (wordIndex <= cue.wordStart || wordIndex > cue.wordEnd) return cues;

  const first: Cue = {
    ...cue,
    id: `${cue.id}a`,
    wordEnd: wordIndex - 1,
    lineBreaks: cue.lineBreaks.filter((b) => b < wordIndex),
  };
  const second: Cue = {
    ...cue,
    id: `${cue.id}b`,
    wordStart: wordIndex,
    lineBreaks: cue.lineBreaks.filter((b) => b > wordIndex),
  };

  // A dragged override described the original span and cannot describe both
  // halves, so it is dropped rather than duplicated onto each.
  delete first.overrideEnd;
  delete second.overrideStart;

  return [
    ...cues.slice(0, cueIndex),
    first,
    second,
    ...cues.slice(cueIndex + 1),
  ];
}

/**
 * Merges a cue with the one after it.
 *
 * Only adjacent cues can merge, and only when they are adjacent in *word* terms
 * too — merging across a gap in the index space would silently swallow the words
 * in between.
 */
export function mergeCues(cues: Cue[], cueIndex: number): Cue[] {
  const first = cues[cueIndex];
  const second = cues[cueIndex + 1];
  if (!first || !second) return cues;
  if (second.wordStart !== first.wordEnd + 1) return cues;

  const merged: Cue = {
    id: first.id,
    wordStart: first.wordStart,
    wordEnd: second.wordEnd,
    // The join becomes a line break: the two cues were separate lines, and
    // keeping the break preserves how the text was already reading.
    lineBreaks: [...first.lineBreaks, second.wordStart, ...second.lineBreaks],
  };

  if (first.overrideStart !== undefined) {
    merged.overrideStart = first.overrideStart;
  }
  if (second.overrideEnd !== undefined) {
    merged.overrideEnd = second.overrideEnd;
  }

  return [...cues.slice(0, cueIndex), merged, ...cues.slice(cueIndex + 2)];
}

/**
 * Shifts a cue's displayed timing without touching its words.
 *
 * Writes overrides, which is what they are for: the user wants this subtitle
 * earlier or later than the speech, usually to compensate for a hard cut. The
 * words keep describing when the audio happened.
 */
export function shiftCue(
  words: Word[],
  cues: Cue[],
  cueIndex: number,
  seconds: number
): Cue[] {
  const cue = cues[cueIndex];
  if (!cue || seconds === 0) return cues;

  const first = words[cue.wordStart];
  const last = words[cue.wordEnd];
  if (!first || !last) return cues;

  const start = (cue.overrideStart ?? first.start) + seconds;
  const end = (cue.overrideEnd ?? last.end) + seconds;

  const next = [...cues];
  next[cueIndex] = {
    ...cue,
    overrideStart: Math.max(0, start),
    overrideEnd: Math.max(0, end),
  };

  return next;
}

/**
 * Which word is being spoken at `seconds`, or -1.
 *
 * Binary search, because the editor calls this on every `timeupdate` — roughly
 * four times a second — against a list that can hold tens of thousands of words.
 * A linear scan would be the editor's dominant cost for no reason.
 */
export function wordAt(words: Word[], seconds: number): number {
  let low = 0;
  let high = words.length - 1;

  while (low <= high) {
    const mid = (low + high) >> 1;
    const word = words[mid]!;

    if (seconds < word.start) high = mid - 1;
    else if (seconds >= word.end) low = mid + 1;
    else return mid;
  }

  return -1;
}

/** Which cue contains `wordIndex`, or -1. */
export function cueContaining(cues: Cue[], wordIndex: number): number {
  return cues.findIndex(
    (cue) => wordIndex >= cue.wordStart && wordIndex <= cue.wordEnd
  );
}
