'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { buildCues, normalizeCues } from '@/lib/subtitles/cues';
import { cueContaining, mergeCues, splitCue, wordAt } from '@/lib/subtitles/edit';
import {
  canRedo,
  canUndo,
  commit,
  createHistory,
  type History,
  redo,
  type TranscriptState,
  undo,
} from '@/lib/subtitles/history';
import { saveDraft } from '@/lib/subtitles/persist';
import { checkCues, summarize } from '@/lib/subtitles/qc';
import { retextCue } from '@/lib/subtitles/retext';
import type { Cue, TimingSource, Word } from '@/lib/subtitles/types';

/**
 * The editor's state: history, playback position, and the operations.
 *
 * Playback position is deliberately **not** in the history state. It changes
 * several times a second while audio plays, and folding it into the undoable
 * state would either fill the undo stack with cursor movements or force every
 * commit to diff around it. They are different kinds of state and are kept apart.
 *
 * The playing word index is also its own piece of state rather than derived
 * during render, so that a `timeupdate` re-renders the two affected words instead
 * of a list of several thousand.
 */

export interface EditorOptions {
  words: Word[];
  cues: Cue[];
  timingSource: TimingSource;
  fileName: string;
  duration: number;
  /** Autosave key from `draftKey`, or null to disable persistence. */
  draftKey: string | null;
}

/** Debounce for autosave: long enough to coalesce a burst of typing. */
const AUTOSAVE_MS = 1500;

/**
 * Starts playback, ignoring the abort that a rapid pause causes.
 *
 * `play()` returns a promise that *rejects* when something pauses before it
 * resolves, and a click-then-double-click — select the cue, then open it for
 * editing — does exactly that. The rejection is expected and means nothing went
 * wrong, but left unhandled it logs an error on an ordinary interaction and
 * would train anyone reading the console to ignore real ones.
 */
function play(audio: HTMLAudioElement | null): void {
  audio?.play().catch(() => {});
}

export function useTranscriptEditor(options: EditorOptions) {
  const [history, setHistory] = useState<History>(() =>
    createHistory({ words: options.words, cues: options.cues })
  );
  const { words, cues } = history.present;

  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selectedCue, setSelectedCue] = useState(0);
  const [editingCue, setEditingCue] = useState<number | null>(null);

  const apply = useCallback((next: TranscriptState) => {
    setHistory((h) => commit(h, next));
  }, []);

  // ---- Operations -------------------------------------------------------

  /**
   * Rewrites a cue's text.
   *
   * Re-wraps afterwards because `retextCue` clears the edited cue's line breaks —
   * a break chosen for the old wording is rarely right for the new one — and
   * re-normalises because a longer line may now breach the duration or gap rules.
   * Both are the same functions the pipeline uses, so an edited transcript obeys
   * exactly the rules a fresh one does.
   */
  const retext = useCallback(
    (cueIndex: number, text: string) => {
      const next = retextCue(words, cues, cueIndex, text);
      if (next.words === words && next.cues === cues) return;

      apply({
        words: next.words,
        cues: normalizeCues(next.words, next.cues),
      });
    },
    [words, cues, apply]
  );

  const split = useCallback(
    (cueIndex: number, wordIndex: number) => {
      const next = splitCue(cues, cueIndex, wordIndex);
      if (next === cues) return;
      apply({ words, cues: normalizeCues(words, next) });
    },
    [words, cues, apply]
  );

  const merge = useCallback(
    (cueIndex: number) => {
      const next = mergeCues(cues, cueIndex);
      if (next === cues) return;
      apply({ words, cues: normalizeCues(words, next) });
    },
    [words, cues, apply]
  );

  /** Drops a cue's words entirely — the bulk-cleanup primitive. */
  const removeCues = useCallback(
    (indices: number[]) => {
      const doomed = new Set(indices);
      if (doomed.size === 0) return;

      const keep = new Set<number>();
      cues.forEach((cue, index) => {
        if (doomed.has(index)) return;
        for (let i = cue.wordStart; i <= cue.wordEnd; i += 1) keep.add(i);
      });

      const nextWords = words.filter((_, index) => keep.has(index));
      if (nextWords.length === 0) return;

      // Rebuilt rather than reindexed: removing whole cues can leave the
      // remaining words wanting a different grouping, and buildCues already
      // knows the rules.
      apply({
        words: nextWords,
        cues: normalizeCues(nextWords, buildCues(nextWords)),
      });
    },
    [words, cues, apply]
  );

  // ---- Playback ---------------------------------------------------------

  const playingWord = useMemo(
    () => (playing || currentTime > 0 ? wordAt(words, currentTime) : -1),
    [words, currentTime, playing]
  );

  const seekTo = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = seconds;
    setCurrentTime(seconds);
  }, []);

  const playCue = useCallback(
    (cueIndex: number) => {
      const cue = cues[cueIndex];
      const first = cue && words[cue.wordStart];
      if (!first) return;
      seekTo(cue.overrideStart ?? first.start);
      play(audioRef.current);
    },
    [cues, words, seekTo]
  );

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) play(audio);
    else audio.pause();
  }, []);

  /**
   * Pauses while a cue is being edited and resumes when it is committed.
   *
   * Type-over-playback is the single largest speed factor in transcription work:
   * without it every correction costs a manual pause and a manual resume, and the
   * user stops using the keyboard flow within a minute.
   */
  const beginEditing = useCallback((cueIndex: number) => {
    audioRef.current?.pause();
    setEditingCue(cueIndex);
    setSelectedCue(cueIndex);
  }, []);

  const endEditing = useCallback(
    (resume: boolean) => {
      setEditingCue(null);
      if (resume) play(audioRef.current);
    },
    []
  );

  // Keep the selected cue in step with playback, so the transcript follows the
  // audio without the user scrolling.
  useEffect(() => {
    if (editingCue !== null || playingWord < 0) return;
    const index = cueContaining(cues, playingWord);
    if (index >= 0) setSelectedCue(index);
  }, [playingWord, cues, editingCue]);

  // ---- Quality report ---------------------------------------------------

  const issues = useMemo(() => checkCues(words, cues), [words, cues]);
  const qc = useMemo(() => summarize(issues), [issues]);

  /** Cue indices carrying at least one issue — what Tab steps through. */
  const flagged = useMemo(
    () => [...new Set(issues.map((i) => i.cueIndex))].sort((a, b) => a - b),
    [issues]
  );

  /** Issues grouped by cue, so a row can render its own badges in O(1). */
  const issuesByCue = useMemo(() => {
    const map = new Map<number, typeof issues>();
    for (const issue of issues) {
      const list = map.get(issue.cueIndex);
      if (list) list.push(issue);
      else map.set(issue.cueIndex, [issue]);
    }

    return map;
  }, [issues]);

  // ---- Autosave ---------------------------------------------------------

  const key = options.draftKey;
  useEffect(() => {
    if (!key) return;
    if (!canUndo(history)) return; // Nothing has been edited yet.

    const timer = setTimeout(() => {
      void saveDraft({
        key,
        fileName: options.fileName,
        duration: options.duration,
        words,
        cues,
        timingSource: options.timingSource,
      });
    }, AUTOSAVE_MS);

    return () => clearTimeout(timer);
  }, [
    key,
    words,
    cues,
    history,
    options.fileName,
    options.duration,
    options.timingSource,
  ]);

  return {
    words,
    cues,
    qc,
    issues,
    issuesByCue,
    flagged,
    audioRef,
    currentTime,
    setCurrentTime,
    playing,
    setPlaying,
    playingWord,
    selectedCue,
    setSelectedCue,
    editingCue,
    beginEditing,
    endEditing,
    retext,
    split,
    merge,
    removeCues,
    seekTo,
    playCue,
    togglePlay,
    undo: () => setHistory(undo),
    redo: () => setHistory(redo),
    canUndo: canUndo(history),
    canRedo: canRedo(history),
  };
}
