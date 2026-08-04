import {
  type AsrSegment,
  type Cue,
  DEFAULT_READABILITY,
  type ReadabilityRules,
  type Word,
} from './types';

/**
 * Words → cues, under the broadcast readability rules.
 *
 * Pure: no DOM, no worker, no model. Cues hold only indices into `Word[]`, so
 * re-segmenting is lossless and a text edit can never disturb timing.
 */

let idCounter = 0;

/** Monotonic within a session; ids only need to be unique, not meaningful. */
function nextId(prefix: string): string {
  idCounter += 1;

  return `${prefix}${idCounter}`;
}

/** Resets id numbering. Exists so tests are deterministic. */
export function resetIds(): void {
  idCounter = 0;
}

/**
 * Derives words from Whisper segments, distributing each segment's duration
 * across its words in proportion to their character length.
 *
 * These timings are **estimates**, and the type system says so via
 * `TimingSource`. Whisper's segment bounds are ~1 s granular and it emits no
 * per-word timing at all, so proportional distribution is the honest best guess
 * until the CTC aligner runs — longer words do take longer to say, which makes
 * it better than an equal split, but it cannot know where a pause fell.
 *
 * `conf` is 0 deliberately: nothing has scored these, and claiming a confidence
 * would let the QC panel imply a verification that never happened.
 */
export function wordsFromSegments(segments: AsrSegment[]): Word[] {
  const words: Word[] = [];

  for (const segment of segments) {
    const tokens = segment.text.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;

    const span = Math.max(0, segment.end - segment.start);
    const totalChars = tokens.reduce((sum, token) => sum + token.length, 0);

    let cursor = segment.start;

    tokens.forEach((token, index) => {
      // A zero-length segment (Whisper occasionally emits one) would make every
      // word start and end at the same instant; give each a nominal slice so
      // cue durations stay orderable.
      const share =
        totalChars > 0
          ? (token.length / totalChars) * span
          : span / tokens.length;
      const start = cursor;
      // Land the final word exactly on the segment end rather than accumulating
      // floating-point drift across the division.
      const end = index === tokens.length - 1 ? segment.end : start + share;
      cursor = end;

      words.push({
        id: nextId('w'),
        text: token,
        origText: token,
        start,
        end: Math.max(start, end),
        conf: 0,
        edited: false,
        timeLocked: false,
      });
    });
  }

  return words;
}

/** Characters a cue would occupy, including the spaces between its words. */
function cueLength(words: Word[], from: number, to: number): number {
  let chars = 0;
  for (let i = from; i <= to; i += 1) {
    chars += (words[i]?.text.length ?? 0) + (i > from ? 1 : 0);
  }

  return chars;
}

/**
 * Groups words into cues.
 *
 * Three limits close a cue, and they are checked in order of how badly a viewer
 * notices the violation:
 *
 * 1. **Character budget** — `maxCharsPerLine * maxLinesPerCue`. Overflowing this
 *    means text that does not fit on screen, so it is hard.
 * 2. **Duration** — `maxCueDuration`. A cue lingering past this reads as a
 *    subtitle that failed to clear.
 * 3. **Sentence end** — a word ending in `.`, `!`, `?` or `…` closes the cue,
 *    because a break at a grammatical boundary is always more readable than one
 *    mid-clause, even when there is budget left.
 *
 * `minCueDuration` and `minGap` are deliberately *not* enforced here — they are
 * timing repairs, not grouping decisions, and applying them during grouping
 * would let a readability rule silently rewrite aligner output. `normalizeCues`
 * does that as a separate, inspectable pass.
 */
export function buildCues(
  words: Word[],
  rules: ReadabilityRules = DEFAULT_READABILITY
): Cue[] {
  if (words.length === 0) return [];

  const budget = rules.maxCharsPerLine * rules.maxLinesPerCue;
  const cues: Cue[] = [];

  let start = 0;

  for (let i = 0; i < words.length; i += 1) {
    const word = words[i];
    if (!word) continue;

    const startWord = words[start];
    const elapsed = (word.end ?? 0) - (startWord?.start ?? 0);
    const overBudget = cueLength(words, start, i) > budget;
    const overTime = elapsed > rules.maxCueDuration;

    // Break *before* the offending word when possible, so the cue that closes
    // is the one that still fits.
    if ((overBudget || overTime) && i > start) {
      cues.push(makeCue(words, start, i - 1, rules));
      start = i;
    }

    const isLast = i === words.length - 1;
    const endsSentence = /[.!?…]["'”’)\]]?$/.test(word.text);

    if (isLast || endsSentence) {
      cues.push(makeCue(words, start, i, rules));
      start = i + 1;
    }
  }

  // A trailing run with no sentence-ending punctuation.
  if (start < words.length) {
    cues.push(makeCue(words, start, words.length - 1, rules));
  }

  return cues;
}

/**
 * Builds one cue and chooses its line break.
 *
 * Prefers the break that leaves the two lines closest in length — unbalanced
 * lines read worse than a slightly-off break point — while never letting either
 * line exceed the per-line budget.
 */
function makeCue(
  words: Word[],
  from: number,
  to: number,
  rules: ReadabilityRules
): Cue {
  const total = cueLength(words, from, to);
  const lineBreaks: number[] = [];

  if (total > rules.maxCharsPerLine && to > from) {
    let bestIndex = -1;
    let bestDelta = Number.POSITIVE_INFINITY;

    for (let i = from + 1; i <= to; i += 1) {
      const first = cueLength(words, from, i - 1);
      const second = cueLength(words, i, to);
      if (first > rules.maxCharsPerLine || second > rules.maxCharsPerLine) {
        continue;
      }
      const delta = Math.abs(first - second);
      if (delta < bestDelta) {
        bestDelta = delta;
        bestIndex = i;
      }
    }

    // No split satisfies both lines (a single very long word, or text far over
    // budget). Fall back to the most balanced split available so the cue still
    // wraps onto two lines rather than overflowing one.
    if (bestIndex === -1) {
      let fallbackDelta = Number.POSITIVE_INFINITY;
      for (let i = from + 1; i <= to; i += 1) {
        const delta = Math.abs(
          cueLength(words, from, i - 1) - cueLength(words, i, to)
        );
        if (delta < fallbackDelta) {
          fallbackDelta = delta;
          bestIndex = i;
        }
      }
    }

    if (bestIndex > from) lineBreaks.push(bestIndex);
  }

  return { id: nextId('c'), wordStart: from, wordEnd: to, lineBreaks };
}

/**
 * Repairs cue timing: enforces a minimum on-screen duration and a minimum gap
 * between consecutive cues.
 *
 * Runs as a separate pass over `overrideStart`/`overrideEnd` and **never
 * touches `Word` timing**, which is what keeps words the single source of truth.
 * A cue that must be extended borrows from the following gap; if there is no
 * room, it is left short rather than overlapping its neighbour — an overlap is
 * a worse defect than a brief cue, and the QC panel will flag what remains.
 */
export function normalizeCues(
  words: Word[],
  cues: Cue[],
  rules: ReadabilityRules = DEFAULT_READABILITY
): Cue[] {
  return cues.map((cue, index) => {
    const first = words[cue.wordStart];
    const last = words[cue.wordEnd];
    if (!first || !last) return cue;

    const start = cue.overrideStart ?? first.start;
    let end = cue.overrideEnd ?? last.end;

    if (end - start < rules.minCueDuration) {
      const wanted = start + rules.minCueDuration;
      const next = cues[index + 1];
      const nextStart = next
        ? (next.overrideStart ?? words[next.wordStart]?.start ?? Infinity)
        : Infinity;
      // Leave the required gap intact; never extend past it.
      end = Math.min(wanted, nextStart - rules.minGap);
      // If the neighbour is already closer than the gap allows, don't move at
      // all rather than producing an end before the start.
      end = Math.max(end, cue.overrideEnd ?? last.end);
    }

    return end === (cue.overrideEnd ?? last.end)
      ? cue
      : { ...cue, overrideEnd: end };
  });
}

/** Characters per second for a cue — the reading-speed metric QC flags on. */
export function cueCps(text: string, start: number, end: number): number {
  const duration = end - start;
  if (duration <= 0) return Number.POSITIVE_INFINITY;
  // Line breaks are not read, so they don't count toward reading load.
  const chars = text.replace(/\n/g, ' ').length;

  return chars / duration;
}
