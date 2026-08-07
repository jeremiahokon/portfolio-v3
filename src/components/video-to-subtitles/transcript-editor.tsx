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

import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Merge,
  Pause,
  Play,
  Redo2,
  Replace,
  Scissors,
  Undo2,
} from 'lucide-react';

import { Tooltip } from '@/components/ui/tooltip';

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
  onBack: (words: Word[], cues: Cue[]) => void;
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
  // Derived from origText rather than read from `edited`. `edited` is the
  // re-alignment marker and M4 clears it once a word has been measured; what the
  // user changed is permanent, whether it still needs re-timing is not.
  const changed = word.text !== word.origText;

  return (
    <span
      className={[
        // Negative margin cancels the padding for layout, so the highlight box
        // still extends past the glyphs while the gap between words stays exactly
        // one space wide. Padding alone made the prose visibly loose once a real
        // space was added between spans.
        '-mx-0.5 rounded-sm px-0.5 transition-colors',
        playing ? 'text-ink bg-amber-200/80' : '',
        !playing && changed ? 'text-emerald-700' : '',
        !playing && !changed && lowConfidence
          ? 'underline decoration-amber-400/70 decoration-wavy underline-offset-4'
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
  canMerge,
  onSelect,
  onPlay,
  onBeginEdit,
  onCommit,
  onCancel,
  onSplit,
  onMerge,
  onNudge,
}: {
  cue: Cue;
  cueIndex: number;
  words: Word[];
  selected: boolean;
  editing: boolean;
  playingWord: number;
  issues: QcIssue[] | undefined;
  showTimes: boolean;
  canMerge: boolean;
  onSelect: (index: number) => void;
  onPlay: (index: number) => void;
  onBeginEdit: (index: number) => void;
  onCommit: (index: number, text: string) => void;
  onCancel: () => void;
  onSplit: (index: number) => void;
  onMerge: (index: number) => void;
  onNudge: (index: number, edge: 'start' | 'end', delta: number) => void;
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
  const end = cue.overrideEnd ?? words[cue.wordEnd]?.end ?? 0;
  const hasError = issues?.some((i) => i.severity === 'error');

  return (
    <div
      // The intrinsic-size hint is what lets the browser skip off-screen blocks
      // without the scrollbar jumping as they render.
      style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 64px' }}
      className={[
        'group relative rounded-sm border px-3 py-2 transition-colors',
        selected
          ? 'border-amber-300/80 bg-amber-50/50'
          : 'border-transparent hover:bg-black/[0.02]',
      ].join(' ')}
      onClick={() => onSelect(cueIndex)}
    >
      <div className="flex items-start gap-3">
        {showTimes && (
          <Tooltip label="When this cue starts. Click to play the audio from here.">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onPlay(cueIndex);
              }}
              className="font-family-inter text-ink/35 hover:text-ink/85 mt-0.5 shrink-0 text-[11px] tabular-nums"
            >
              {stamp(start)}
            </button>
          </Tooltip>
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
            className="font-family-inter text-ink w-full resize-none rounded-sm border border-amber-300 bg-white px-2 py-1 text-[15px] leading-relaxed outline-none"
          />
        ) : (
          <p
            // A single click, not a double. The whole point of this view is that the
            // text is editable, and hiding that behind a double-click meant people
            // clicked once, heard the audio start, and concluded it was read-only.
            // Playback moved to the timestamp button beside it, which is a clearer
            // home for it anyway.
            onClick={(e) => {
              e.stopPropagation();
              onBeginEdit(cueIndex);
            }}
            role="button"
            aria-label="Edit this line"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onBeginEdit(cueIndex);
              }
            }}
            className="font-family-inter text-ink/85 hover:bg-ink/[0.03] focus-visible:ring-sky-deep/40 flex-1 cursor-text rounded-sm text-[15px] leading-relaxed focus-visible:ring-2 focus-visible:outline-none"
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

        {showTimes && !editing && (
          <Tooltip label="When this cue ends.">
            <span className="font-family-inter text-ink/25 mt-0.5 shrink-0 cursor-help text-[11px] tabular-nums">
              {stamp(end)}
            </span>
          </Tooltip>
        )}

        {issues && issues.length > 0 && !editing && (
          <Tooltip
            label={
              <ul className="space-y-0.5">
                {issues.map((issue) => (
                  <li key={issue.kind}>{issue.message}</li>
                ))}
              </ul>
            }
          >
            <span
              className={[
                'mt-0.5 flex shrink-0 cursor-help items-center gap-1 rounded-sm px-2 py-0.5 text-[10px]',
                hasError
                  ? 'bg-red-100 text-red-700'
                  : 'bg-amber-100 text-amber-800',
              ].join(' ')}
            >
              <AlertTriangle className="h-3 w-3" />
              {issues.length}
            </span>
          </Tooltip>
        )}
      </div>

      {/* Timing controls. Only in Cue mode, and only for the selected cue —
          showing six buttons on every one of 441 rows would bury the text this
          view exists to display. */}
      {showTimes && selected && !editing && (
        <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-black/5 pt-2">
          <span className="font-family-inter text-ink/30 mr-1 text-[10px] uppercase">
            in
          </span>
          <EdgeNudge
            onNudge={(delta) => onNudge(cueIndex, 'start', delta)}
            label="the moment this cue appears"
          />
          <span className="font-family-inter text-ink/30 mr-1 ml-2 text-[10px] uppercase">
            out
          </span>
          <EdgeNudge
            onNudge={(delta) => onNudge(cueIndex, 'end', delta)}
            label="the moment this cue disappears"
          />

          <span className="ml-auto flex items-center gap-1">
            <Tooltip label="Split this cue in two at the playhead, or at its midpoint if the audio is elsewhere. Only the grouping changes — no word is re-timed.">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSplit(cueIndex);
                }}
                className="text-ink/75 hover:text-ink rounded-sm p-1.5 hover:bg-black/5"
                aria-label="Split cue"
              >
                <Scissors className="h-3.5 w-3.5" />
              </button>
            </Tooltip>
            <Tooltip
              label={
                canMerge
                  ? 'Join this cue with the one after it. Lossless — it only rewrites the grouping.'
                  : 'Nothing to merge with: this is the last cue.'
              }
            >
              <button
                type="button"
                disabled={!canMerge}
                onClick={(e) => {
                  e.stopPropagation();
                  onMerge(cueIndex);
                }}
                className="text-ink/75 hover:text-ink disabled:text-ink/15 rounded-sm p-1.5 hover:bg-black/5"
                aria-label="Merge with next cue"
              >
                <Merge className="h-3.5 w-3.5" />
              </button>
            </Tooltip>
          </span>
        </div>
      )}
    </div>
  );
});

/**
 * A pair of nudge buttons for one cue edge.
 *
 * 100 ms a click, because subtitle timing is judged by eye against speech and that
 * is roughly the smallest step a viewer notices. Dragging was the original plan;
 * buttons are better here — they work on touch, they work from the keyboard, and
 * they are precise, whereas dragging a handle across a row that has no time axis
 * drawn on it would be guesswork.
 */
const NUDGE_SECONDS = 0.1;

function EdgeNudge({
  onNudge,
  label,
}: {
  onNudge: (delta: number) => void;
  label: string;
}) {
  return (
    <span className="inline-flex items-center">
      <Tooltip label={`Move ${label} 100 ms earlier.`}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onNudge(-NUDGE_SECONDS);
          }}
          className="text-ink/75 hover:text-ink rounded-sm p-1 hover:bg-black/5"
          aria-label={`Move ${label} earlier`}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
      </Tooltip>
      <Tooltip label={`Move ${label} 100 ms later.`}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onNudge(NUDGE_SECONDS);
          }}
          className="text-ink/75 hover:text-ink rounded-sm p-1 hover:bg-black/5"
          aria-label={`Move ${label} later`}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </Tooltip>
    </span>
  );
}

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
    nudgeEdge,
    slideCue,
    split,
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

  /**
   * Splits the cue where the user is listening.
   *
   * `splitCue` needs a word index, and the honest answer to "which word?" is the one
   * the playhead is on — that is where the user's attention is when they decide a cue
   * is too long. With the audio elsewhere it falls back to the midpoint, which at
   * least halves the cue rather than shaving a word off one end.
   */
  const splitAtPlayhead = useCallback(
    (cueIndex: number) => {
      const cue = cues[cueIndex];
      if (!cue) return;

      const inside =
        playingWord > cue.wordStart && playingWord <= cue.wordEnd
          ? playingWord
          : cue.wordStart + Math.ceil((cue.wordEnd - cue.wordStart) / 2);

      split(cueIndex, inside);
    },
    [cues, playingWord, split]
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
        case 'k':
          event.preventDefault();
          splitAtPlayhead(selectedCue);
          break;
        // Shifts the whole cue rather than one edge: for when the subtitle should
        // appear earlier or later than the speech, which is a different intent from
        // trimming it, and writes an override instead of re-timing the words.
        case ',':
          event.preventDefault();
          slideCue(selectedCue, -0.1);
          break;
        case '.':
          event.preventDefault();
          slideCue(selectedCue, 0.1);
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
      splitAtPlayhead,
      slideCue,
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
      <div className="rounded-sm border border-white/60 bg-white/70 shadow-[0_20px_60px_-20px_rgba(44,51,51,0.25)] backdrop-blur-md">
        {/* Transport */}
        <div className="flex flex-wrap items-center gap-3 border-b border-black/5 px-4 py-3">
          <Tooltip label="Play or pause the audio. Space does the same from anywhere in the transcript.">
            <button
              type="button"
              onClick={togglePlay}
              aria-label={playing ? 'Pause' : 'Play'}
              className="bg-ink flex h-9 w-9 items-center justify-center rounded-sm text-white"
            >
              {playing ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="ml-0.5 h-4 w-4" />
              )}
            </button>
          </Tooltip>

          <Tooltip label="Where the audio is now, and how long the file is.">
            <span className="font-family-inter text-ink/75 cursor-help text-xs tabular-nums">
              {stamp(currentTime)} / {stamp(props.duration)}
            </span>
          </Tooltip>

          <Tooltip label="Cues are the subtitle blocks that get exported. Words are the timed units underneath them — editing a word's text never moves its timing.">
            <span className="font-family-inter text-ink/75 cursor-help text-xs">
              {stats}
            </span>
          </Tooltip>

          {qc.clean ? (
            <Tooltip label="Every cue is within the readability rules: under 42 characters a line, at most two lines, no overlaps, and a comfortable reading speed.">
              <span className="cursor-help rounded-sm bg-emerald-100 px-2 py-0.5 text-[10px] text-emerald-700">
                no issues
              </span>
            </Tooltip>
          ) : (
            <Tooltip label="Errors are cues a player may refuse to render — overlapping, or too short to display. Warnings are legible but uncomfortable, usually reading too fast. Click, or press Tab, to jump to the next one.">
              <button
                type="button"
                onClick={() => stepFlagged(1)}
                className="rounded-sm bg-amber-100 px-2 py-0.5 text-[10px] text-amber-800"
              >
                {qc.errors} errors · {qc.warnings} warnings — press Tab
              </button>
            </Tooltip>
          )}

          <div className="ml-auto flex items-center gap-1">
            <Tooltip label="Undo the last change (⌘Z). Fifty steps are kept.">
              <button
                type="button"
                onClick={undoEdit}
                disabled={!canUndo}
                aria-label="Undo"
                className="text-ink/80 disabled:text-ink/20 rounded-sm p-2 whitespace-nowrap hover:bg-black/5"
              >
                <Undo2 className="h-4 w-4" />
              </button>
            </Tooltip>
            <Tooltip label="Redo (⇧⌘Z).">
              <button
                type="button"
                onClick={redoEdit}
                disabled={!canRedo}
                aria-label="Redo"
                className="text-ink/80 disabled:text-ink/20 rounded-sm p-2 whitespace-nowrap hover:bg-black/5"
              >
                <Redo2 className="h-4 w-4" />
              </button>
            </Tooltip>
            <Tooltip label="Find and replace across the whole transcript (⌘F). The fastest way to fix a name the model got wrong everywhere at once.">
              <button
                type="button"
                onClick={() => setFindOpen((v) => !v)}
                aria-label="Find and replace"
                className={[
                  'rounded-sm p-2 hover:bg-black/5',
                  findOpen ? 'text-ink bg-black/5' : 'text-ink/80',
                ].join(' ')}
              >
                <Replace className="h-4 w-4" />
              </button>
            </Tooltip>
            <Tooltip
              label={
                showTimes
                  ? 'Switch to Read view: the transcript as prose, without timestamps, for reading and correcting quickly.'
                  : 'Switch to Cue view: one row per subtitle block with its start time, for checking timing.'
              }
            >
              <button
                type="button"
                onClick={() => setShowTimes((v) => !v)}
                className="font-family-inter text-ink/80 rounded-sm px-2 py-1 text-xs hover:bg-black/5"
              >
                {showTimes ? 'Read' : 'Cues'}
              </button>
            </Tooltip>
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
                onSelect={setSelectedCue}
                onPlay={(i) => {
                  setSelectedCue(i);
                  playCue(i);
                }}
                canMerge={index < cues.length - 1}
                onBeginEdit={beginEditing}
                onCommit={(i, text) => {
                  retext(i, text);
                  endEditing(false);
                }}
                onCancel={() => endEditing(false)}
                onSplit={splitAtPlayhead}
                onMerge={merge}
                onNudge={nudgeEdge}
              />
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center gap-3 border-t border-black/5 px-4 py-3">
          <p className="font-family-inter text-ink/75 text-[11px]">
            Click any line to edit it · Space plays · Tab jumps to the next
            issue · ⌘F to replace everywhere · K splits, J merges, , / . shift
          </p>
          <div className="ml-auto flex gap-2">
            <Tooltip label="Return to the download options. Your edits are kept.">
              <button
                type="button"
                onClick={() => props.onBack(words, cues)}
                className="font-family-inter text-ink/80 rounded-sm px-4 py-2 text-xs hover:bg-black/5"
              >
                Back
              </button>
            </Tooltip>
            <Tooltip label="Apply your edits and go to the download options — the exported file will match what you see here.">
              <button
                type="button"
                onClick={() => props.onExport(words, cues)}
                className="bg-ink font-family-inter rounded-sm px-5 py-2 text-xs text-white"
              >
                Done — export
              </button>
            </Tooltip>
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
