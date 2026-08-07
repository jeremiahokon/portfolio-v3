import type { AlignedWord, Word } from './types';

/**
 * Folds aligner output back into the word list.
 *
 * Pure, and deliberately conservative: this is the one place where a machine
 * overwrites timings a user may already have curated, so every rule here is about
 * what it must *not* do.
 *
 * 1. **Never touches `text`.** The aligner is told what the words are; it has no
 *    opinion about them. Only `start`, `end` and `conf` move.
 * 2. **Never overwrites a `timeLocked` word.** A boundary a human dragged is
 *    ground truth and outranks any model.
 * 3. **Matches by index, not by time.** Aligner results carry the index of the
 *    word they describe, so a window that could not align some words still lands
 *    the rest on the right ones.
 * 4. **Keeps the estimate when the alignment is worse than nothing.** A word the
 *    aligner never placed, or placed with a score below threshold, is left alone.
 */

export interface ApplyOptions {
  /** Below this score the estimated timing is kept instead. */
  minScore: number;
}

export const DEFAULT_APPLY: ApplyOptions = { minScore: 0.15 };

export interface ApplyResult {
  words: Word[];
  /** How many words actually took a new timing. */
  aligned: number;
  /** Words left on their estimate because the score was too low or absent. */
  kept: number;
  /** Words skipped because a human had locked them. */
  locked: number;
}

/**
 * Applies alignments to `words`, keyed by index.
 *
 * `alignments` maps a word index to its aligned timing. Anything absent keeps
 * whatever it had.
 */
export function applyAlignment(
  words: Word[],
  alignments: Map<number, AlignedWord>,
  options: ApplyOptions = DEFAULT_APPLY
): ApplyResult {
  let aligned = 0;
  let kept = 0;
  let locked = 0;

  const out = words.map((word, index) => {
    const match = alignments.get(index);

    if (!match) {
      kept += 1;

      return word;
    }
    if (word.timeLocked) {
      locked += 1;

      return word;
    }
    if (match.conf < options.minScore) {
      kept += 1;

      return word;
    }
    // A zero-length or inverted span carries no usable timing; the estimate is
    // strictly better than a collapsed one.
    if (match.end <= match.start) {
      kept += 1;

      return word;
    }

    aligned += 1;

    return { ...word, start: match.start, end: match.end, conf: match.conf };
  });

  return { words: out, aligned, kept, locked };
}

/**
 * Repairs ordering after a partial alignment.
 *
 * Mixing aligned and estimated timings can leave a word starting before the one
 * before it ended — the two came from different sources with different ideas about
 * where the audio was. Enforced forward-only, and **aligned words win**: a
 * conflicting *estimate* is pushed, never a measurement, because the estimate was
 * the weaker number to begin with.
 */
export function enforceWordOrder(words: Word[]): Word[] {
  const out: Word[] = [];

  for (const word of words) {
    const previous = out.at(-1);
    if (!previous) {
      out.push({ ...word });
      continue;
    }

    if (word.start < previous.end) {
      const wordIsMeasured = word.conf > 0;
      const previousIsMeasured = previous.conf > 0;

      if (wordIsMeasured && !previousIsMeasured) {
        // Pull the estimate back rather than push the measurement forward.
        previous.end = Math.max(previous.start, word.start);
        out.push({ ...word });
        continue;
      }

      const start = previous.end;
      out.push({ ...word, start, end: Math.max(start, word.end) });
      continue;
    }

    out.push({ ...word });
  }

  return out;
}

/** A slice of the transcript to align in one forward pass. */
export interface AlignmentWindow {
  /** Inclusive word index. */
  from: number;
  /** Exclusive word index. */
  to: number;
  /** Seconds. */
  start: number;
  /** Seconds. */
  end: number;
}

export interface WindowOptions {
  /**
   * Longest window in seconds. The trellis is O(frames × characters), and both
   * grow with the window, so this bounds memory as well as time. It is also the
   * unit of re-alignment after an edit: a smaller window means a cheaper redo.
   */
  maxSeconds: number;
  /**
   * Seconds of audio added either side. The aligner needs a little room before
   * the first word and after the last, or it must explain the very first frame as
   * speech and will pull the boundary early.
   */
  pad: number;
}

export const DEFAULT_WINDOWS: WindowOptions = { maxSeconds: 20, pad: 0.25 };

/**
 * Groups words into windows for alignment.
 *
 * Splits on the **largest gap** available once a window is long enough, rather
 * than at a fixed duration. A window boundary that falls inside a word forces the
 * aligner to explain half a word from each side, which is the same failure that
 * makes chunk boundaries land in silence during transcription.
 */
export function planAlignmentWindows(
  words: Word[],
  duration: number,
  options: WindowOptions = DEFAULT_WINDOWS
): AlignmentWindow[] {
  if (words.length === 0) return [];

  const windows: AlignmentWindow[] = [];
  let from = 0;

  while (from < words.length) {
    const windowStart = words[from]!.start;
    let to = from + 1;
    let bestSplit = -1;
    let bestGap = -1;

    while (to < words.length) {
      const word = words[to]!;
      if (word.end - windowStart > options.maxSeconds) break;

      // Track the roomiest gap seen, as the preferred place to cut.
      const gap = word.start - words[to - 1]!.end;
      if (gap > bestGap) {
        bestGap = gap;
        bestSplit = to;
      }
      to += 1;
    }

    // Cut at the best gap only if it leaves a usefully large window; otherwise
    // take everything that fit, and never fewer than one word or this loops.
    const end =
      to < words.length && bestSplit > from + 1 && bestGap > 0 ? bestSplit : to;
    const last = words[end - 1]!;

    windows.push({
      from,
      to: end,
      start: Math.max(0, windowStart - options.pad),
      end: Math.min(duration, last.end + options.pad),
    });

    from = end;
  }

  return windows;
}

/** Builds the index → alignment map from a worker's per-window results. */
export function indexAlignments(
  results: Array<{ from: number; words: AlignedWord[] }>
): Map<number, AlignedWord> {
  const map = new Map<number, AlignedWord>();

  for (const { from, words } of results) {
    words.forEach((word, offset) => {
      // Later windows overwrite earlier ones on purpose: an overlap region is
      // better described by the window that holds it fully.
      map.set(from + offset, word);
    });
  }

  return map;
}

/**
 * The windows an edit made stale — M4's whole point.
 *
 * Re-transcribing after a text edit would be absurd, and re-aligning the entire file
 * is nearly as wasteful: on a 39-minute transcript that is 90-odd forward passes to
 * fix the timing of one corrected phrase. The aligner is a single non-autoregressive
 * pass per window, so re-running *only* the windows containing edited words is
 * roughly free — which is the property the two-model architecture was chosen for in
 * the first place.
 *
 * A window qualifies when it holds a word marked `edited` that is not `timeLocked`.
 * The lock check matters: a word whose boundary a human dragged has the timing they
 * asked for, and pulling its window back through the aligner to overwrite it would
 * be the exact behaviour `timeLocked` exists to prevent. A window whose only edited
 * words are locked has nothing left to measure, so it is skipped entirely rather than
 * processed and discarded.
 */
export function windowsNeedingRealignment(
  words: Word[],
  duration: number,
  options: WindowOptions = DEFAULT_WINDOWS
): AlignmentWindow[] {
  return planAlignmentWindows(words, duration, options).filter((window) =>
    words
      .slice(window.from, window.to)
      .some((word) => word.edited && !word.timeLocked)
  );
}

/**
 * Clears the re-alignment marker on words a pass has now measured.
 *
 * `edited` is documented as "marks the region for re-alignment", so leaving it set
 * after re-aligning would make every later pass redo the same windows forever. It is
 * not the record of *what the user changed* — `origText` is, and `text !== origText`
 * survives this untouched, which is what the editor highlights from.
 */
export function clearRealignmentMarks(
  words: Word[],
  windows: AlignmentWindow[]
): Word[] {
  if (windows.length === 0) return words;

  const touched = new Set<number>();
  for (const window of windows) {
    for (let i = window.from; i < window.to; i += 1) touched.add(i);
  }

  let changed = false;
  const next = words.map((word, index) => {
    if (!touched.has(index) || !word.edited) return word;
    changed = true;

    return { ...word, edited: false };
  });

  return changed ? next : words;
}
