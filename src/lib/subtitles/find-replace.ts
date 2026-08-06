import { retextCue } from './retext';
import type { Cue, Word } from './types';

/**
 * Find and replace across the transcript.
 *
 * **The highest-leverage feature in the editor, and it was absent from the
 * original M3 scope.** Measured on the 39-minute Zoom call: 241 wrong tokens over
 * roughly 79 distinct terms, dominated by proper nouns and industry vocabulary the
 * model cannot know — Amadeus, ARC, IATA, a company name, a person's name. The
 * same wrong name recurring eleven times is *one* action here and eleven
 * corrections without it.
 *
 * It also turned out to be the *only* mechanism available. Whisper supports prompt
 * conditioning, which would fix these terms before they are ever wrong, but
 * transformers.js 4.2.0 declares `prompt_ids` and implements nothing — so there is
 * no way to tell the model the vocabulary up front (open question 9). Correcting
 * after the fact is the whole game.
 *
 * **No new splicing code.** Replacement is expressed entirely through `retextCue`,
 * the one primitive allowed to change the length of `Word[]`. Matches are found
 * within a single cue, grouped by cue, and applied **cue-descending** so every
 * index is still valid when its turn comes. That ordering removes the index-drift
 * class of bug outright rather than compensating for it, and it means find and
 * replace inherits every guarantee `retext.test.ts` already proves — surviving
 * words keep byte-identical timing, following cues reindex correctly.
 */

export interface FindOptions {
  caseSensitive: boolean;
  /** Match whole words only, ignoring surrounding punctuation. */
  wholeWord: boolean;
}

export const DEFAULT_FIND: FindOptions = {
  caseSensitive: false,
  wholeWord: true,
};

export interface Match {
  cueIndex: number;
  /** Inclusive word indices. Always within one cue. */
  from: number;
  to: number;
}

/** A word's letters and digits, without surrounding punctuation. */
function core(text: string): string {
  return text.replaceAll(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}

function fold(text: string, caseSensitive: boolean): string {
  return caseSensitive ? text : text.toLowerCase();
}

function wordMatches(
  word: string,
  token: string,
  options: FindOptions
): boolean {
  const a = fold(word, options.caseSensitive);
  const b = fold(token, options.caseSensitive);

  return options.wholeWord ? core(a) === core(b) : a.includes(b);
}

/**
 * Every occurrence of `query`, which may be several words.
 *
 * **Matches never cross a cue boundary.** A phrase spanning two cues has no
 * obvious owner for its replacement — the words would have to be split between
 * them by some rule nobody asked for — so those are left alone rather than handled
 * badly. In practice cue boundaries land in pauses, so a phrase rarely straddles
 * one anyway.
 */
export function findMatches(
  words: Word[],
  cues: Cue[],
  query: string,
  options: FindOptions = DEFAULT_FIND
): Match[] {
  const tokens = query.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];

  const matches: Match[] = [];

  cues.forEach((cue, cueIndex) => {
    let at = cue.wordStart;

    while (at + tokens.length - 1 <= cue.wordEnd) {
      const hit = tokens.every((token, offset) =>
        wordMatches(words[at + offset]?.text ?? '', token, options)
      );

      if (hit) {
        matches.push({ cueIndex, from: at, to: at + tokens.length - 1 });
        // Overlapping matches would be replaced twice, so skip past this one.
        at += tokens.length;
      } else {
        at += 1;
      }
    }
  });

  return matches;
}

/**
 * Substitutes `replacement` into one word range, keeping the punctuation.
 *
 * Replacing "arrc," with "ARC" should give "ARC," — dropping the comma would make
 * every correction cost a second edit to put the punctuation back, which would make
 * the feature annoying enough to stop using.
 */
function substitute(
  words: Word[],
  from: number,
  to: number,
  replacement: string
): string {
  const first = words[from]?.text ?? '';
  const last = words[to]?.text ?? '';

  // A token with no letters or digits at all — a stray "..." — is all punctuation,
  // and taking both its lead and its trail would duplicate the whole thing.
  const lead = core(first) === '' ? '' : (/^[^\p{L}\p{N}]*/u.exec(first)?.[0] ?? '');
  const trail = core(last) === '' ? '' : (/[^\p{L}\p{N}]*$/u.exec(last)?.[0] ?? '');

  return `${lead}${replacement}${trail}`;
}

export interface ReplaceResult {
  words: Word[];
  cues: Cue[];
  /** How many occurrences were actually replaced. */
  replaced: number;
}

/**
 * Replaces every match.
 *
 * Cues are rewritten whole rather than word by word, because `retextCue` takes
 * text and works out the diff itself — which is also what makes the unchanged
 * words in an edited cue keep their measured timings.
 */
export function replaceAll(
  words: Word[],
  cues: Cue[],
  matches: Match[],
  replacement: string
): ReplaceResult {
  if (matches.length === 0) return { words, cues, replaced: 0 };

  const byCue = new Map<number, Match[]>();
  for (const match of matches) {
    const list = byCue.get(match.cueIndex);
    if (list) list.push(match);
    else byCue.set(match.cueIndex, [match]);
  }

  let state = { words, cues };
  let replaced = 0;

  // Descending, so a splice in a later cue cannot invalidate an earlier index.
  for (const cueIndex of [...byCue.keys()].sort((a, b) => b - a)) {
    const cue = state.cues[cueIndex];
    if (!cue) continue;

    const hits = [...byCue.get(cueIndex)!].sort((a, b) => a.from - b.from);
    const pieces: string[] = [];
    let at = cue.wordStart;

    for (const hit of hits) {
      if (hit.from < at || hit.to > cue.wordEnd) continue;
      for (let i = at; i < hit.from; i += 1) {
        pieces.push(state.words[i]!.text);
      }
      pieces.push(substitute(state.words, hit.from, hit.to, replacement));
      at = hit.to + 1;
      replaced += 1;
    }

    for (let i = at; i <= cue.wordEnd; i += 1) {
      pieces.push(state.words[i]!.text);
    }

    state = retextCue(state.words, state.cues, cueIndex, pieces.join(' '));
  }

  return { ...state, replaced };
}
