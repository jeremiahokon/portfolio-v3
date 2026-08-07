import { lcsIndexPairs, tokenKey } from './lcs';
import type { Cue, Word } from './types';

/**
 * Retyping a cue's text.
 *
 * **This is the only function in the codebase that changes the length of
 * `Word[]`, and it must stay that way.** Cues address words by index
 * (`types.ts:35-39`), so every insertion or deletion shifts the indices of every
 * cue after it. Confining that to one function with one test suite is the entire
 * design: `edit.ts`'s operations all preserve word count, and the moment a second
 * place starts splicing, index drift becomes a class of bug rather than an
 * enumerable set of cases.
 *
 * Why cue-level text at all, rather than per-word inputs: editing prose through a
 * grid of one-word fields is unusable, and correcting a transcript is prose work.
 * The user types into the cue; this function works out what they actually changed.
 *
 * **The invariant that survives it.** Words the edit did not change keep their
 * `start` and `end` *byte-identical* — the M3 acceptance criterion — because they
 * are the same objects, not recomputed ones. And since the pairing key ignores
 * case and punctuation (`lcs.ts:tokenKey`), the most common edits of all,
 * capitalisation and punctuation, change no timing whatsoever.
 */

export interface RetextResult {
  words: Word[];
  cues: Cue[];
}

let counter = 0;

/** Ids only need to be unique; the prefix marks where a word came from. */
function newId(): string {
  counter += 1;

  return `we${counter}`;
}

/** Resets the id counter. Mirrors `cues.ts:resetIds`, for deterministic tests. */
export function resetRetextIds(): void {
  counter = 0;
}

function tokenize(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

/**
 * Spreads `[from, to]` across `tokens` in proportion to their length.
 *
 * The same rule `wordsFromSegments` uses for estimated timings, and equally
 * provisional: these words carry `conf: 0` and `edited: true` so the QC panel
 * reports them as unmeasured rather than badly aligned, and so M4 knows exactly
 * which region to re-align.
 */
function distribute(
  tokens: string[],
  from: number,
  to: number
): Array<{ text: string; start: number; end: number }> {
  const span = Math.max(0, to - from);
  const total = tokens.reduce((sum, t) => sum + t.length, 0);
  let at = from;

  return tokens.map((text, index) => {
    const share =
      total > 0 ? (text.length / total) * span : span / tokens.length;
    const start = at;
    // The last token ends exactly at `to` rather than at an accumulated sum, so
    // rounding cannot leave a sliver of unattributed time at the cue's edge.
    const end = index === tokens.length - 1 ? to : start + share;
    at = end;

    return { text, start, end };
  });
}

/**
 * Rewrites the words of `cues[cueIndex]` from `text`.
 *
 * Returns the inputs unchanged when nothing changed, or when the edit would leave
 * the cue with no words — emptying a cue is a deletion, which is a different
 * operation with different consequences for the cues around it, and silently
 * treating it as one here would be a trap.
 */
export function retextCue(
  words: Word[],
  cues: Cue[],
  cueIndex: number,
  text: string
): RetextResult {
  const cue = cues[cueIndex];
  if (!cue) return { words, cues };

  const from = cue.wordStart;
  const to = cue.wordEnd;
  const old = words.slice(from, to + 1);
  if (old.length === 0) return { words, cues };

  const tokens = tokenize(text);
  if (tokens.length === 0) return { words, cues };

  // Nothing changed at all, not even punctuation: keep object identity so React
  // can skip re-rendering the list.
  if (
    tokens.length === old.length &&
    tokens.every((t, i) => t === old[i]!.text)
  ) {
    return { words, cues };
  }

  const anchors = lcsIndexPairs(
    old.map((w) => tokenKey(w.text)),
    tokens.map(tokenKey)
  );

  const cueStart = old[0]!.start;
  const cueEnd = old.at(-1)!.end;
  const rebuilt: Word[] = [];

  /**
   * Rewrites one run of words between two anchors.
   *
   * When the counts match, this is a substitution: each word keeps its own
   * timing, id, confidence and lock, and only its text changes. That covers
   * correcting a word in place, and it is why a lock survives an ordinary edit.
   *
   * When the counts differ the run is genuinely re-segmented — one word became
   * two, or three became one — and there is no honest mapping from old timings to
   * new tokens, so the run's span is redistributed and the results are marked
   * unmeasured. A `timeLocked` word inside such a run does lose its lock, because
   * the boundary it described no longer refers to anything.
   */
  const rewriteGap = (
    oldFrom: number,
    oldTo: number,
    newFrom: number,
    newTo: number,
    spanFrom: number,
    spanTo: number
  ): void => {
    const oldRun = old.slice(oldFrom, oldTo);
    const newRun = tokens.slice(newFrom, newTo);
    if (newRun.length === 0) return;

    if (oldRun.length === newRun.length) {
      for (const [i, token] of newRun.entries()) {
        const word = oldRun[i]!;
        rebuilt.push(
          word.text === token ? word : { ...word, text: token, edited: true }
        );
      }

      return;
    }

    for (const piece of distribute(newRun, spanFrom, spanTo)) {
      rebuilt.push({
        id: newId(),
        text: piece.text,
        // Nothing recognised these words, so there is no original to diff against.
        origText: oldRun.length === 1 ? oldRun[0]!.text : '',
        start: piece.start,
        end: piece.end,
        conf: 0,
        edited: true,
        timeLocked: false,
      });
    }
  };

  let oldAt = 0;
  let newAt = 0;

  for (const [oldIndex, newIndex] of anchors) {
    rewriteGap(
      oldAt,
      oldIndex,
      newAt,
      newIndex,
      oldAt === 0 ? cueStart : old[oldAt - 1]!.end,
      old[oldIndex]!.start
    );

    // The anchor itself survives. Same object when the text is byte-identical,
    // otherwise the same timing with new text — this is the path a punctuation or
    // capitalisation fix takes, and it must not touch `start` or `end`.
    const anchorWord = old[oldIndex]!;
    const token = tokens[newIndex]!;
    rebuilt.push(
      anchorWord.text === token
        ? anchorWord
        : { ...anchorWord, text: token, edited: true }
    );

    oldAt = oldIndex + 1;
    newAt = newIndex + 1;
  }

  rewriteGap(
    oldAt,
    old.length,
    newAt,
    tokens.length,
    oldAt === 0 ? cueStart : old[oldAt - 1]!.end,
    cueEnd
  );

  const delta = rebuilt.length - old.length;

  const nextWords = [...words.slice(0, from), ...rebuilt, ...words.slice(to + 1)];

  const nextCues = cues.map((existing, index) => {
    if (index < cueIndex) return existing;

    if (index === cueIndex) {
      return {
        ...existing,
        wordEnd: existing.wordEnd + delta,
        // Breaks were chosen for the old wording and rarely fit the new one. The
        // caller re-wraps through the normal cue-building path, exactly as
        // `splitCue` already does.
        lineBreaks: [],
      };
    }

    if (delta === 0) return existing;

    return {
      ...existing,
      wordStart: existing.wordStart + delta,
      wordEnd: existing.wordEnd + delta,
      lineBreaks: existing.lineBreaks.map((b) => b + delta),
    };
  });

  return { words: nextWords, cues: nextCues };
}
