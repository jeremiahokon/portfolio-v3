'use client';

import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { AlertTriangle, Pause, Play, Redo2, Replace, Undo2 } from 'lucide-react';

import type { QcIssue } from '@/lib/subtitles/qc';
import type { Cue, Word } from '@/lib/subtitles/types';

import { FindReplacePanel } from './find-replace-panel';
import { useTranscriptEditor } from './use-transcript-editor';

/**
 * The transcript editor.
 *
 * **A reading surface first, a timing grid second (D18).** Measured on a real
 * 39-minute call, human time goes to recurring proper nouns and scattered word
 * errors — not to cue boundaries. So the default view is continuous prose with
 * cue breaks shown as thin markers, and the familiar one-row-per-cue grid is a
 * toggle. 755 rows of seven words each is a hostile way to read anything.
 *
 * **Virtualisation.** Cue blocks use `content-visibility: auto` with an intrinsic
 * size hint rather than a virtualiser dependency: the browser skips layout and
 * paint for off-screen blocks, and unlike a virtualiser it handles variable
 * heights natively, keeps Ctrl-F working, and adds nothing to the bundle. The
 * remaining cost is React reconciliation over the block list, which `memo` on
 * `CueBlock` keeps to the blocks that actually changed. If the 10,000-word 60fps
 * gate fails on a real profile, a virtualiser goes in then — not before.
 */

interface Props {
  words: Word[];
  cues: Cue[];
  timingSource: 'estimated' | 'aligned';
  fileName: string;
  duration: number;
  mediaUrl: string | null;
  draftKey: string | null;
  onBack: () => void;
  onExport: (words: Word[], cues: Cue[]) => void;
}

function cueText(words: Word[], cue: Cue): string {
  return words
    .slice(cue.wordStart, cue.wordEnd + 1)
    .map((w) => w.text)
    .join(' ');
}

function stamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);

  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * One word.
 *
 * Four states, and they mean different things, which is why they do not share a
 * colour. `conf: 0` means **unmeasured**, not badly aligned — an un-aligned
 * transcript has conf 0 everywhere, and flagging all of it would teach the user
 * to ignore the signal entirely.
 */
const WordSpan = memo(function WordSpan({
  word,
  playing,
  lowConfidence,
}: {
  word: Word;
  playing: boolean;
  lowConfidence: boolean;
}) {
  return (
    <span
      className={[
        // Negative margin cancels the padding for layout, so the highlight box
        // still extends past the glyphs while the gap between words stays exactly
        // one space wide. Padding alone made the prose visibly loose once a real
        // space was added between spans.
        'rounded -mx-0.5 px-0.5 transition-colors',
        playing ? 'bg-amber-200/80 text-ink' : '',
        !playing && word.edited ? 'text-emerald-700' : '',
        !playing && !word.edited && lowConfidence
          ? 'decoration-amber-400/70 underline decoration-wavy underline-offset-4'
          : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {word.text}
    </span>
  );
});

const CueBlock = memo(function CueBlock({
  cue,
  cueIndex,
  words,
  selected,
  editing,
  playingWord,
  issues,
  showTimes,
  onSelect,
  onBeginEdit,
  onCommit,
  onCancel,
}: {
  cue: Cue;
  cueIndex: number;
  words: Word[];
  selected: boolean;
  editing: boolean;
  playingWord: number;
  issues: QcIssue[] | undefined;
  showTimes: boolean;
  onSelect: (index: number) => void;
  onBeginEdit: (index: number) => void;
  onCommit: (index: number, text: string) => void;
  onCancel: () => void;
}) {
  const text = cueText(words, cue);
  const [draft, setDraft] = useState(text);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(text);
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing, text]);

  const start = cue.overrideStart ?? words[cue.wordStart]?.start ?? 0;
  const hasError = issues?.some((i) => i.severity === 'error');

  return (
    <div
      // The intrinsic-size hint is what lets the browser skip off-screen blocks
      // without the scrollbar jumping as they render.
      style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 64px' }}
      className={[
        'group relative rounded-xl border px-3 py-2 transition-colors',
        selected
          ? 'border-amber-300/80 bg-amber-50/50'
          : 'border-transparent hover:bg-black/[0.02]',
      ].join(' ')}
      onClick={() => onSelect(cueIndex)}
    >
      <div className="flex items-start gap-3">
        {showTimes && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelect(cueIndex);
            }}
            className="font-family-inter text-ink/35 hover:text-ink/70 mt-0.5 shrink-0 text-[11px] tabular-nums"
          >
            {stamp(start)}
          </button>
        )}

        {editing ? (
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => onCommit(cueIndex, draft)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                onCancel();
              }
              // Enter commits; Shift-Enter is a line break inside the cue.
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onCommit(cueIndex, draft);
              }
              e.stopPropagation();
            }}
            rows={2}
            className="font-family-inter text-ink w-full resize-none rounded-lg border border-amber-300 bg-white px-2 py-1 text-[15px] leading-relaxed outline-none"
          />
        ) : (
          <p
            onDoubleClick={() => onBeginEdit(cueIndex)}
            className="font-family-inter text-ink/85 flex-1 text-[15px] leading-relaxed"
          >
            {words.slice(cue.wordStart, cue.wordEnd + 1).map((word, i) => (
              // The separator is a real text node, not padding. Styling the gap
              // instead would look right and copy wrong — selecting the
              // transcript would yield "ARCnumberAirlines" — and would read as
              // one long word to a screen reader.
              <Fragment key={word.id}>
                {i > 0 ? ' ' : null}
                <WordSpan
                  word={word}
                  playing={cue.wordStart + i === playingWord}
                  lowConfidence={word.conf > 0 && word.conf < 0.35}
                />
              </Fragment>
            ))}
          </p>
        )}

        {issues && issues.length > 0 && !editing && (
          <span
            title={issues.map((i) => i.message).join('\n')}
            className={[
              'mt-0.5 flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px]',
              hasError
                ? 'bg-red-100 text-red-700'
                : 'bg-amber-100 text-amber-800',
            ].join(' ')}
          >
            <AlertTriangle className="h-3 w-3" />
            {issues.length}
          </span>
        )}
      </div>
    </div>
  );
});

export function TranscriptEditor(props: Props) {
  const editor = useTranscriptEditor({
    words: props.words,
    cues: props.cues,
    timingSource: props.timingSource,
    fileName: props.fileName,
    duration: props.duration,
    draftKey: props.draftKey,
  });

  const [showTimes, setShowTimes] = useState(true);
  const [findOpen, setFindOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const {
    words,
    cues,
    qc,
    flagged,
    issuesByCue,
    selectedCue,
    setSelectedCue,
    editingCue,
    playingWord,
    replace,
    removeCues,
    audioRef,
    currentTime,
    setCurrentTime,
    playing,
    setPlaying,
    beginEditing,
    endEditing,
    retext,
    merge,
    playCue,
    togglePlay,
    undo: undoEdit,
    redo: redoEdit,
    canUndo,
    canRedo,
  } = editor;

  // Keep the selected cue on screen as playback moves through the transcript.
  useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>(
      `[data-cue="${selectedCue}"]`
    );
    node?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedCue]);

  const step = useCallback(
    (delta: number) => {
      setSelectedCue((current) =>
        Math.min(cues.length - 1, Math.max(0, current + delta))
      );
    },
    [cues.length, setSelectedCue]
  );

  /** Next cue carrying a QC issue — the point of routing attention. */
  const stepFlagged = useCallback(
    (delta: number) => {
      if (flagged.length === 0) return;
      const after = flagged.filter((i) =>
        delta > 0 ? i > selectedCue : i < selectedCue
      );
      const target =
        delta > 0
          ? (after[0] ?? flagged[0]!)
          : (after.at(-1) ?? flagged.at(-1)!);
      setSelectedCue(target);
      playCue(target);
    },
    [flagged, selectedCue, setSelectedCue, playCue]
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (editingCue !== null) return;
      const meta = event.metaKey || event.ctrlKey;

      if (meta && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        setFindOpen(true);

        return;
      }

      if (meta && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redoEdit();
        else undoEdit();

        return;
      }

      switch (event.key) {
        case ' ':
          event.preventDefault();
          togglePlay();
          break;
        case 'ArrowDown':
          event.preventDefault();
          step(1);
          break;
        case 'ArrowUp':
          event.preventDefault();
          step(-1);
          break;
        case 'Tab':
          event.preventDefault();
          stepFlagged(event.shiftKey ? -1 : 1);
          break;
        case 'Enter':
          event.preventDefault();
          beginEditing(selectedCue);
          break;
        case 'j':
          merge(selectedCue);
          break;
        default:
          break;
      }
    },
    [
      editingCue,
      selectedCue,
      step,
      stepFlagged,
      togglePlay,
      beginEditing,
      merge,
      undoEdit,
      redoEdit,
    ]
  );

  const stats = useMemo(
    () => `${cues.length} cues · ${words.length} words`,
    [cues.length, words.length]
  );

  return (
    <div className="mx-auto w-full max-w-4xl">
      <div className="rounded-3xl border border-white/60 bg-white/70 shadow-[0_20px_60px_-20px_rgba(44,51,51,0.25)] backdrop-blur-md">
        {/* Transport */}
        <div className="flex flex-wrap items-center gap-3 border-b border-black/5 px-4 py-3">
          <button
            type="button"
            onClick={togglePlay}
            aria-label={playing ? 'Pause' : 'Play'}
            className="bg-ink flex h-9 w-9 items-center justify-center rounded-full text-white"
          >
            {playing ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="ml-0.5 h-4 w-4" />
            )}
          </button>

          <span className="font-family-inter text-ink/50 text-xs tabular-nums">
            {stamp(currentTime)} / {stamp(props.duration)}
          </span>

          <span className="font-family-inter text-ink/40 text-xs">{stats}</span>

          {qc.clean ? (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] text-emerald-700">
              no issues
            </span>
          ) : (
            <button
              type="button"
              onClick={() => stepFlagged(1)}
              className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-800"
            >
              {qc.errors} errors · {qc.warnings} warnings — press Tab
            </button>
          )}

          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={undoEdit}
              disabled={!canUndo}
              aria-label="Undo"
              className="text-ink/60 disabled:text-ink/20 rounded-lg p-2 hover:bg-black/5"
            >
              <Undo2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={redoEdit}
              disabled={!canRedo}
              aria-label="Redo"
              className="text-ink/60 disabled:text-ink/20 rounded-lg p-2 hover:bg-black/5"
            >
              <Redo2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setFindOpen((v) => !v)}
              aria-label="Find and replace"
              className={[
                'rounded-lg p-2 hover:bg-black/5',
                findOpen ? 'text-ink bg-black/5' : 'text-ink/60',
              ].join(' ')}
            >
              <Replace className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setShowTimes((v) => !v)}
              className="font-family-inter text-ink/60 rounded-lg px-2 py-1 text-xs hover:bg-black/5"
            >
              {showTimes ? 'Read' : 'Cues'}
            </button>
          </div>
        </div>

        {findOpen && (
          <FindReplacePanel
            words={words}
            cues={cues}
            flaggedCount={flagged.length}
            onReplace={replace}
            onDeleteFlagged={() => removeCues(flagged)}
            onClose={() => setFindOpen(false)}
          />
        )}

        {/* Transcript */}
        <div
          ref={listRef}
          tabIndex={0}
          onKeyDown={onKeyDown}
          role="list"
          aria-label="Transcript"
          className="max-h-[60vh] overflow-y-auto p-2 outline-none"
        >
          {cues.map((cue, index) => (
            <div key={cue.id} data-cue={index} role="listitem">
              <CueBlock
                cue={cue}
                cueIndex={index}
                words={words}
                selected={index === selectedCue}
                editing={index === editingCue}
                playingWord={playingWord}
                issues={issuesByCue.get(index)}
                showTimes={showTimes}
                onSelect={(i) => {
                  setSelectedCue(i);
                  playCue(i);
                }}
                onBeginEdit={beginEditing}
                onCommit={(i, text) => {
                  retext(i, text);
                  endEditing(false);
                }}
                onCancel={() => endEditing(false)}
              />
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center gap-3 border-t border-black/5 px-4 py-3">
          <p className="font-family-inter text-ink/40 text-[11px]">
            Double-click or Enter to edit · Space plays · Tab jumps to the next
            issue · ⌘F to replace everywhere
          </p>
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={props.onBack}
              className="font-family-inter text-ink/60 rounded-full px-4 py-2 text-xs hover:bg-black/5"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => props.onExport(words, cues)}
              className="bg-ink font-family-inter rounded-full px-5 py-2 text-xs text-white"
            >
              Done — export
            </button>
          </div>
        </div>
      </div>

      {props.mediaUrl && (
        <audio
          ref={audioRef}
          src={props.mediaUrl}
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          className="hidden"
        />
      )}
    </div>
  );
}
