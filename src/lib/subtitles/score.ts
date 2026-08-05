/**
 * The M2 acceptance gate: how accurate are the aligner's word boundaries?
 *
 * Pure, so it runs in Node against committed JSON with no browser, no model and
 * no audio. That is the point — the gate has to be re-runnable per dtype
 * (fp16 / q4f16 / int8) and per code change, cheaply, or it will not get run.
 *
 * **Why precision *and* recall, at a collar.** A single "average error in
 * milliseconds" hides the failure that matters: a handful of catastrophically
 * misplaced boundaries averaged against many good ones still looks fine. Instead
 * a boundary counts as correct only if it lands within `collar` seconds of a
 * true one, and then:
 *
 * - **recall** — what fraction of true boundaries did we find? Low recall means
 *   real word edges are missing or badly placed.
 * - **precision** — what fraction of our boundaries are real? Low precision
 *   means we are inventing edges.
 *
 * Reporting only one is how a bad aligner passes: emit a boundary every 50 ms and
 * recall approaches 1 while precision collapses.
 */

/** A hand-aligned or machine-aligned word with absolute times in seconds. */
export interface TimedWord {
  text: string;
  start: number;
  end: number;
}

/**
 * The committed ground truth for a reference clip.
 *
 * Hand-aligned once in an audio editor and never regenerated, which is what makes
 * it a fixed yardstick rather than a moving one. `audio` names the fixture it
 * belongs to so a reference can never be scored against the wrong clip.
 */
export interface ReferenceAlignment {
  /** Fixture filename this alignment describes. */
  audio: string;
  /** Seconds. Used to sanity-check that the reference covers the clip. */
  duration: number;
  words: TimedWord[];
  /** Free-text note on how and when it was aligned. */
  note?: string;
}

export interface ScoreOptions {
  /**
   * Seconds of tolerance either side of a true boundary. 0.2 s is the plan's
   * gate. Anything much tighter measures the patience of whoever did the hand
   * alignment rather than the aligner.
   */
  collar: number;
  /** Score only words whose text satisfies this. Used for the digits sub-clip. */
  filter?: (word: TimedWord) => boolean;
}

export const DEFAULT_SCORE: ScoreOptions = { collar: 0.2 };

export interface BoundaryScore {
  precision: number;
  recall: number;
  f1: number;
  /** Boundaries matched one-to-one within the collar. */
  hits: number;
  /** Reference boundaries with no hypothesis within the collar. */
  missed: number;
  /** Hypothesis boundaries with no reference within the collar. */
  spurious: number;
  referenceCount: number;
  hypothesisCount: number;
  /** Mean absolute error over matched boundaries only, in seconds. */
  meanAbsoluteError: number;
  /** Worst matched error, in seconds. The number that catches outliers. */
  maxAbsoluteError: number;
}

/**
 * Every boundary a word list defines: each word contributes a start and an end.
 *
 * Adjacent words in continuous speech share an instant, and the duplicate is
 * kept deliberately rather than deduplicated — a boundary that is both the end of
 * one word and the start of the next is genuinely two things the aligner had to
 * get right, and collapsing them would quietly halve the weight of fluent speech
 * relative to isolated words.
 */
export function boundaries(words: TimedWord[]): number[] {
  return words.flatMap((word) => [word.start, word.end]).sort((a, b) => a - b);
}

/**
 * Scores hypothesis boundaries against reference boundaries.
 *
 * Matching is greedy left-to-right and strictly **one-to-one**: each hypothesis
 * boundary can claim at most one reference boundary and vice versa. Without that
 * constraint a single hypothesis boundary sitting between two nearby reference
 * boundaries would satisfy both, and a cluster of hypothesis boundaries could all
 * claim the same reference one — either way the score would flatter the aligner.
 *
 * Greedy is optimal here because both sequences are sorted and the collar is a
 * fixed window: taking the earliest available match never blocks a better one.
 */
export function scoreBoundaries(
  reference: number[],
  hypothesis: number[],
  collar: number = DEFAULT_SCORE.collar
): BoundaryScore {
  const ref = [...reference].sort((a, b) => a - b);
  const hyp = [...hypothesis].sort((a, b) => a - b);

  const errors: number[] = [];
  let i = 0;
  let j = 0;

  while (i < ref.length && j < hyp.length) {
    const delta = hyp[j]! - ref[i]!;

    if (Math.abs(delta) <= collar) {
      errors.push(Math.abs(delta));
      i += 1;
      j += 1;
    } else if (delta < 0) {
      // This hypothesis boundary is too early to match anything remaining.
      j += 1;
    } else {
      // This reference boundary has no hypothesis near it.
      i += 1;
    }
  }

  const hits = errors.length;
  const missed = ref.length - hits;
  const spurious = hyp.length - hits;

  const precision = hyp.length === 0 ? 0 : hits / hyp.length;
  const recall = ref.length === 0 ? 0 : hits / ref.length;

  return {
    precision,
    recall,
    f1:
      precision + recall === 0
        ? 0
        : (2 * precision * recall) / (precision + recall),
    hits,
    missed,
    spurious,
    referenceCount: ref.length,
    hypothesisCount: hyp.length,
    meanAbsoluteError:
      hits === 0 ? 0 : errors.reduce((a, b) => a + b, 0) / hits,
    maxAbsoluteError: hits === 0 ? 0 : Math.max(...errors),
  };
}

/** Comparable form of a word: case- and punctuation-insensitive. */
function normalize(text: string): string {
  return text.toLowerCase().replaceAll(/[^\p{L}\p{N}]/gu, '');
}

/**
 * Pairs reference words with hypothesis words by text, via a longest common
 * subsequence.
 *
 * A forced aligner is *given* the transcript, so the two sequences normally match
 * token for token. LCS is here for the cases where they do not — a dropped token,
 * a differently split contraction — so a single mismatch shifts one pair rather
 * than destroying the alignment of everything after it.
 */
export function pairWordsByText(
  reference: TimedWord[],
  hypothesis: TimedWord[]
): Array<[TimedWord, TimedWord]> {
  const a = reference.map((w) => normalize(w.text));
  const b = hypothesis.map((w) => normalize(w.text));

  // Standard LCS table. The reference clip is ~120 words, so the quadratic cost
  // is irrelevant and clarity wins.
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

  const pairs: Array<[TimedWord, TimedWord]> = [];
  let i = 0;
  let j = 0;

  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      pairs.push([reference[i]!, hypothesis[j]!]);
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

export interface WordScore extends BoundaryScore {
  /** Words present in both sequences, so comparable at all. */
  pairedWords: number;
  /** Reference words with no counterpart in the hypothesis. */
  unpairedReference: number;
  /** Hypothesis words with no counterpart in the reference. */
  unpairedHypothesis: number;
}

/**
 * The primary gate metric: per-word boundary accuracy, matched by identity.
 *
 * **This exists because the purely time-based metric has a blind spot that would
 * have let a badly broken aligner through.** Scoring `scoreBoundaries` on a
 * reference shifted by a uniform 350 ms — every word attributed to the wrong span,
 * an unambiguous failure — returns 0.75 recall, because in continuous speech
 * boundaries sit 0.2–0.4 s apart and each drifted boundary lands within the collar
 * of its *neighbour*. Nearest-in-time matching cannot tell "aligned" from "off by
 * one word".
 *
 * Matching reference word *i* to hypothesis word *i* removes that blind spot
 * entirely: a uniform drift now fails, as it must. Use this for the gate, and
 * `scoreBoundaries` only as the secondary check for an aligner emitting boundaries
 * it was never asked for.
 */
export function scoreWords(
  reference: TimedWord[],
  hypothesis: TimedWord[],
  options: ScoreOptions = DEFAULT_SCORE
): WordScore {
  const keep = options.filter ?? (() => true);
  const ref = reference.filter(keep);
  const hyp = hypothesis.filter(keep);
  const pairs = pairWordsByText(ref, hyp);

  const errors: number[] = [];
  let hits = 0;

  for (const [expected, actual] of pairs) {
    // A word has two boundaries and both must land, because a start that is right
    // with an end that is wrong still renders as a visibly wrong subtitle.
    for (const delta of [
      Math.abs(actual.start - expected.start),
      Math.abs(actual.end - expected.end),
    ]) {
      if (delta <= options.collar) {
        hits += 1;
        errors.push(delta);
      }
    }
  }

  // Denominators count every boundary of every word, including unpaired ones:
  // a word the aligner failed to place at all is a miss, not an exclusion.
  const referenceCount = ref.length * 2;
  const hypothesisCount = hyp.length * 2;

  const precision = hypothesisCount === 0 ? 0 : hits / hypothesisCount;
  const recall = referenceCount === 0 ? 0 : hits / referenceCount;

  return {
    precision,
    recall,
    f1:
      precision + recall === 0
        ? 0
        : (2 * precision * recall) / (precision + recall),
    hits,
    missed: referenceCount - hits,
    spurious: hypothesisCount - hits,
    referenceCount,
    hypothesisCount,
    meanAbsoluteError:
      errors.length === 0
        ? 0
        : errors.reduce((a, b) => a + b, 0) / errors.length,
    maxAbsoluteError: errors.length === 0 ? 0 : Math.max(...errors),
    pairedWords: pairs.length,
    unpairedReference: ref.length - pairs.length,
    unpairedHypothesis: hyp.length - pairs.length,
  };
}

/**
 * Scores an aligner's word list against a hand-aligned reference.
 *
 * Delegates to `scoreWords`, the identity-aware metric. Applies `filter` to
 * **both** sides, so scoring the digits sub-clip compares digits against digits
 * rather than digits against everything.
 */
export function scoreAlignment(
  reference: TimedWord[],
  hypothesis: TimedWord[],
  options: ScoreOptions = DEFAULT_SCORE
): WordScore {
  return scoreWords(reference, hypothesis, options);
}

/** Words the aligner is characteristically bad at: digits, acronyms, symbols. */
export function isHardWord(word: TimedWord): boolean {
  const text = word.text;

  return (
    // Any digit — "2026", "14:30", "3rd".
    /\d/.test(text) ||
    // Two or more capitals in a row — "API", "SDK", "NASA".
    /\p{Lu}{2,}/u.test(text) ||
    // A symbol that is read aloud as a word: currency, percent, ampersand.
    /[$£€%&@#+=]/.test(text)
  );
}

/** Does a score clear the gate? Both metrics must, not their average. */
export function passesGate(score: BoundaryScore, threshold = 0.9): boolean {
  return score.precision >= threshold && score.recall >= threshold;
}

/** One row of the per-dtype comparison the milestone has to report. */
export interface ScoreReportRow {
  label: string;
  approxBytes?: number;
  overall: BoundaryScore;
  /** Digits, acronyms and symbols scored separately, per the risk register. */
  hard?: BoundaryScore;
}

/**
 * Renders the comparison as a markdown table.
 *
 * The milestone has to report **every** tier tried, not only the one that
 * shipped, so a later reader can see how close the alternatives were rather than
 * taking "we picked this" on trust.
 */
export function formatReport(rows: ScoreReportRow[], threshold = 0.9): string {
  const header =
    '| dtype | size | precision | recall | F1 | mean err | max err | hard P/R | gate |\n' +
    '|---|---|---|---|---|---|---|---|---|';

  const body = rows.map((row) => {
    const o = row.overall;
    const size = row.approxBytes
      ? `${(row.approxBytes / 1_000_000).toFixed(1)} MB`
      : '—';
    const hard = row.hard
      ? `${row.hard.precision.toFixed(3)} / ${row.hard.recall.toFixed(3)}`
      : '—';

    return `| ${row.label} | ${size} | ${o.precision.toFixed(3)} | ${o.recall.toFixed(3)} | ${o.f1.toFixed(3)} | ${(o.meanAbsoluteError * 1000).toFixed(0)} ms | ${(o.maxAbsoluteError * 1000).toFixed(0)} ms | ${hard} | ${passesGate(o, threshold) ? 'PASS' : 'fail'} |`;
  });

  return [header, ...body].join('\n');
}

/**
 * Picks the tier to ship: the **smallest** that clears the gate.
 *
 * Deliberately not the most accurate. Once a tier is accurate enough to caption
 * with, further accuracy is worth less than the megabytes it costs on a page
 * whose job is to earn a call — so extra precision beyond the threshold buys
 * nothing and download weight is the top risk.
 */
export function chooseTier(
  rows: ScoreReportRow[],
  threshold = 0.9
): ScoreReportRow | null {
  return (
    rows
      .filter((row) => passesGate(row.overall, threshold))
      .sort(
        (a, b) =>
          (a.approxBytes ?? Number.POSITIVE_INFINITY) -
          (b.approxBytes ?? Number.POSITIVE_INFINITY)
      )
      .at(0) ?? null
  );
}
