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
 * Greedily wraps a word range into lines no longer than `maxChars`.
 *
 * Returns the word indices at which each new line begins, excluding the first.
 * A word longer than `maxChars` gets its own line and overflows it — there is
 * nowhere else for it to go, and silently dropping it would be worse.
 */
function wrapLines(
  words: Word[],
  from: number,
  to: number,
  maxChars: number
): number[] {
  const breaks: number[] = [];
  let lineLength = 0;

  for (let i = from; i <= to; i += 1) {
    const length = words[i]?.text.length ?? 0;
    const withSpace = lineLength === 0 ? length : lineLength + 1 + length;

    if (lineLength > 0 && withSpace > maxChars) {
      breaks.push(i);
      lineLength = length;
    } else {
      lineLength = withSpace;
    }
  }

  return breaks;
}

/**
 * Whether a word range can actually be laid out within the cue's line budget.
 *
 * This is the real constraint, and it is **not** the same as the total character
 * count fitting `maxCharsPerLine * maxLinesPerCue`. A cue of 81 characters is
 * inside an 84-character budget, yet if its word boundaries fall such that no
 * split leaves both lines under 42, it cannot be rendered legally. Gating
 * grouping on the total alone produced exactly that: a real 43-character line
 * in an SRT whose cue measured 81. Wrapping decides it instead.
 */
function fitsInCue(
  words: Word[],
  from: number,
  to: number,
  rules: ReadabilityRules
): boolean {
  return (
    wrapLines(words, from, to, rules.maxCharsPerLine).length + 1 <=
    rules.maxLinesPerCue
  );
}

/**
 * Groups words into cues.
 *
 * Three limits close a cue, and they are checked in order of how badly a viewer
 * notices the violation:
 *
 * 1. **Layout** — the words must wrap into at most `maxLinesPerCue` lines of at
 *    most `maxCharsPerLine`. Checked by actually wrapping them, not by comparing
 *    against the product of the two: see `fitsInCue` for why that distinction is
 *    load-bearing rather than pedantic.
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

  const cues: Cue[] = [];

  let start = 0;

  for (let i = 0; i < words.length; i += 1) {
    const word = words[i];
    if (!word) continue;

    const startWord = words[start];
    const elapsed = (word.end ?? 0) - (startWord?.start ?? 0);
    const overflows = !fitsInCue(words, start, i, rules);
    const overTime = elapsed > rules.maxCueDuration;

    // Break *before* the offending word when possible, so the cue that closes
    // is the one that still fits.
    if ((overflows || overTime) && i > start) {
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
 * Builds one cue and chooses its line breaks.
 *
 * For the common two-line case, prefers the split leaving the lines closest in
 * length — unbalanced lines read worse than a slightly-off break point — but
 * only among splits where **both** lines fit `maxCharsPerLine`.
 *
 * When no such split exists, it falls back to greedy wrapping rather than to the
 * most balanced illegal split. Greedy is guaranteed to respect the per-line
 * limit wherever it is physically possible, and a balanced-but-overflowing line
 * is the specific defect that shipped a 43-character line once already.
 * `buildCues` should have closed the cue before it got here, so this path is now
 * reachable only for a single word longer than a whole line.
 */
function makeCue(
  words: Word[],
  from: number,
  to: number,
  rules: ReadabilityRules
): Cue {
  const total = cueLength(words, from, to);

  if (total <= rules.maxCharsPerLine || to === from) {
    return { id: nextId('c'), wordStart: from, wordEnd: to, lineBreaks: [] };
  }

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

  const lineBreaks =
    bestIndex > from
      ? [bestIndex]
      : wrapLines(words, from, to, rules.maxCharsPerLine);

  return { id: nextId('c'), wordStart: from, wordEnd: to, lineBreaks };
}

/**
 * Repairs cue timing against the section 2.4 rules.
 *
 * Runs as a separate pass writing only `overrideStart`/`overrideEnd`, and
 * **never touches `Word` timing** — that is what keeps words the single source
 * of truth and makes every repair here inspectable and reversible.
 *
 * Three passes, in this order because each depends on the previous:
 *
 * 1. **Separate touching cues.** The gap is taken out of the *earlier* cue's
 *    tail rather than by delaying the later cue's start. Delaying the start
 *    would make a subtitle appear after its word has been spoken, which is a
 *    worse error than clearing the previous one a few frames early.
 * 2. **Grow cues that are too short or read too fast**, into whatever gap
 *    follows. A cue needs `chars / maxCps` seconds to be readable at the
 *    ceiling, so reading speed and minimum duration are the same kind of
 *    problem — both want more time — and are solved together.
 * 3. Never shrink a cue below where it already ended, and never cross into the
 *    next one.
 *
 * What this deliberately does **not** do is split a cue to fix reading speed:
 * splitting divides characters and time in the same proportion, so the ratio
 * survives untouched. Only more time, or better word timings from the aligner,
 * actually fixes CPS. Whatever remains after this is a genuine violation for
 * the QC panel to surface rather than something to paper over.
 */
export function normalizeCues(
  words: Word[],
  cues: Cue[],
  rules: ReadabilityRules = DEFAULT_READABILITY
): Cue[] {
  if (cues.length === 0) return cues;

  const bounds = cues.map((cue) => {
    const first = words[cue.wordStart];
    const last = words[cue.wordEnd];
    const start = cue.overrideStart ?? first?.start ?? 0;
    const end = cue.overrideEnd ?? last?.end ?? 0;

    return {
      start,
      end,
      originalEnd: end,
      // Spaces count toward reading load; a line break merely replaces one, so
      // this matches the rendered character count.
      chars: cueLength(words, cue.wordStart, cue.wordEnd),
    };
  });

  // Pass 1 — enforce the minimum gap by trimming the earlier cue's tail.
  for (let i = 1; i < bounds.length; i += 1) {
    const previous = bounds[i - 1]!;
    const current = bounds[i]!;
    const latestAllowedEnd = current.start - rules.minGap;

    if (previous.end > latestAllowedEnd) {
      // Clamped at its own start so a cue can never invert, even when two cues
      // begin closer together than the gap itself.
      previous.end = Math.max(previous.start, latestAllowedEnd);
    }
  }

  // Pass 2 — grow the too-short and the too-fast into the following gap.
  for (let i = 0; i < bounds.length; i += 1) {
    const current = bounds[i]!;
    const next = bounds[i + 1];
    const ceiling = next ? next.start - rules.minGap : Number.POSITIVE_INFINITY;

    let wanted = current.end;
    if (current.end - current.start < rules.minCueDuration) {
      wanted = Math.max(wanted, current.start + rules.minCueDuration);
    }
    if (rules.maxCps > 0 && current.chars > 0) {
      wanted = Math.max(wanted, current.start + current.chars / rules.maxCps);
    }

    // Grow only: `Math.max` against the current end means a ceiling that is
    // already behind us leaves the cue alone instead of pulling it backwards.
    current.end = Math.max(current.end, Math.min(wanted, ceiling));
  }

  return cues.map((cue, index) => {
    const bound = bounds[index]!;
    if (bound.end === bound.originalEnd) return cue;

    return { ...cue, overrideEnd: bound.end };
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
