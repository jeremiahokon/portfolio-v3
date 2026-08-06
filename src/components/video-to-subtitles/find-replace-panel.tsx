'use client';

import { useMemo, useState } from 'react';

import { Check, Search, Sparkles, Trash2 } from 'lucide-react';

import {
  DEFAULT_FIND,
  findMatches,
  type FindOptions,
} from '@/lib/subtitles/find-replace';
import type { Cue, Word } from '@/lib/subtitles/types';
import { suggestCorrections } from '@/lib/subtitles/vocab';

/**
 * Find and replace, plus the vocabulary that tells you what to search for.
 *
 * These belong in one panel because they are one workflow: the vocabulary list
 * finds the terms the model got wrong, and replace fixes each one everywhere at
 * once. On the 39-minute call that is 241 wrong tokens across about 79 terms —
 * unusable as 241 individual edits, and about 79 clicks like this.
 */

interface Props {
  words: Word[];
  cues: Cue[];
  flaggedCount: number;
  onReplace: (query: string, replacement: string, options: FindOptions) => number;
  onDeleteFlagged: () => void;
  onClose: () => void;
}

export function FindReplacePanel({
  words,
  cues,
  flaggedCount,
  onReplace,
  onDeleteFlagged,
  onClose,
}: Props) {
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [options, setOptions] = useState<FindOptions>(DEFAULT_FIND);
  const [vocabulary, setVocabulary] = useState('');
  const [done, setDone] = useState<string | null>(null);

  const matches = useMemo(
    () => (query.trim() ? findMatches(words, cues, query, options) : []),
    [words, cues, query, options]
  );

  const suggestions = useMemo(
    () =>
      suggestCorrections(
        words,
        vocabulary.split(/[\n,]/).map((t) => t.trim())
      ).slice(0, 12),
    [words, vocabulary]
  );

  const run = (from: string, to: string) => {
    const count = onReplace(from, to, options);
    setDone(
      count > 0
        ? `Replaced ${count} occurrence${count === 1 ? '' : 's'} of “${from}”`
        : `No occurrences of “${from}” found`
    );
  };

  return (
    <div className="border-b border-black/5 bg-white/60 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="text-ink/30 pointer-events-none absolute top-2.5 left-3 h-3.5 w-3.5" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setDone(null);
            }}
            placeholder="Find"
            aria-label="Find"
            className="font-family-inter border-ink/10 focus:border-ink/30 w-full rounded-full border bg-white py-2 pr-3 pl-9 text-xs outline-none"
          />
        </div>

        <input
          value={replacement}
          onChange={(e) => setReplacement(e.target.value)}
          placeholder="Replace with"
          aria-label="Replace with"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && matches.length > 0) run(query, replacement);
          }}
          className="font-family-inter border-ink/10 focus:border-ink/30 min-w-[160px] flex-1 rounded-full border bg-white px-4 py-2 text-xs outline-none"
        />

        <button
          type="button"
          disabled={matches.length === 0}
          onClick={() => run(query, replacement)}
          className="bg-ink font-family-inter disabled:bg-ink/20 rounded-full px-4 py-2 text-xs text-white"
        >
          Replace {matches.length > 0 ? `all ${matches.length}` : 'all'}
        </button>

        <button
          type="button"
          onClick={onClose}
          className="font-family-inter text-ink/50 rounded-full px-3 py-2 text-xs hover:bg-black/5"
        >
          Close
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-4">
        <label className="font-family-inter text-ink/50 flex items-center gap-1.5 text-[11px]">
          <input
            type="checkbox"
            checked={options.caseSensitive}
            onChange={(e) =>
              setOptions((o) => ({ ...o, caseSensitive: e.target.checked }))
            }
          />
          Match case
        </label>
        <label className="font-family-inter text-ink/50 flex items-center gap-1.5 text-[11px]">
          <input
            type="checkbox"
            checked={options.wholeWord}
            onChange={(e) =>
              setOptions((o) => ({ ...o, wholeWord: e.target.checked }))
            }
          />
          Whole words
        </label>

        {flaggedCount > 0 && (
          <button
            type="button"
            onClick={onDeleteFlagged}
            className="font-family-inter ml-auto inline-flex items-center gap-1.5 rounded-full border border-red-200 px-3 py-1 text-[11px] text-red-700 hover:bg-red-50"
          >
            <Trash2 className="h-3 w-3" />
            Delete {flaggedCount} flagged cues
          </button>
        )}
      </div>

      {done && (
        <p className="font-family-inter mt-2 inline-flex items-center gap-1.5 text-[11px] text-emerald-700">
          <Check className="h-3 w-3" />
          {done}
        </p>
      )}

      {/* Vocabulary */}
      <div className="mt-3 border-t border-black/5 pt-3">
        <label className="font-family-inter text-ink/50 mb-1.5 flex items-center gap-1.5 text-[11px]">
          <Sparkles className="h-3 w-3" />
          Names and terms the model won’t know — one per line
        </label>
        <textarea
          value={vocabulary}
          onChange={(e) => setVocabulary(e.target.value)}
          rows={2}
          placeholder={'Amadeus\nIATA\nARC'}
          className="font-family-inter border-ink/10 focus:border-ink/30 w-full resize-none rounded-xl border bg-white px-3 py-2 text-xs outline-none"
        />

        {suggestions.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <li key={`${s.term}-${s.found}`}>
                <button
                  type="button"
                  onClick={() => {
                    setQuery(s.found);
                    setReplacement(s.term);
                    run(s.found, s.term);
                  }}
                  title={
                    s.reason === 'phonetic'
                      ? `“${s.found}” sounds like “${s.term}”`
                      : `“${s.found}” is spelled close to “${s.term}”`
                  }
                  className="font-family-inter border-sky-deep/30 text-sky-deep hover:bg-sky/10 rounded-full border px-2.5 py-1 text-[11px]"
                >
                  {s.found} → {s.term}
                  <span className="text-ink/35 ml-1.5">×{s.count}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {vocabulary.trim() !== '' && suggestions.length === 0 && (
          <p className="font-family-inter text-ink/40 mt-2 text-[11px]">
            Nothing in the transcript resembles those terms — they may already be
            correct.
          </p>
        )}
      </div>
    </div>
  );
}
