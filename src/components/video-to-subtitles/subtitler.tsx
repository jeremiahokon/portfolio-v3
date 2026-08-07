'use client';

import { useEffect, useRef, useState } from 'react';
import { sendGAEvent } from '@next/third-parties/google';

import { AlertCircle } from 'lucide-react';
import { AnimatePresence } from 'motion/react';

import { TooltipProvider } from '@/components/ui/tooltip';

import { GA_EVENTS } from '@/lib/analytics-events';
import { useReducedMotion } from '@/lib/hooks';
import { ASR } from '@/lib/models/config';
import { draftKey } from '@/lib/subtitles/persist';

import { Dropzone } from './dropzone';
import { ExportPanel } from './export-panel';
import { ProgressPanel } from './progress-panel';
import { TranscriptEditor } from './transcript-editor';
import { useSubtitler } from './use-subtitler';

/**
 * The glass shell and its panel machine.
 *
 * Exactly one keyed panel is rendered at a time inside a single
 * `AnimatePresence mode="wait"`, matching the extractor so both tools read as
 * the same object.
 */
export function Subtitler() {
  const reduced = useReducedMotion();
  const {
    snapshot,
    busy,
    start,
    reset,
    refineTiming,
    realignEdits,
    applyEdits,
  } = useSubtitler();
  const [isDragging, setIsDragging] = useState(false);
  const [editing, setEditing] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // The editor needs the original media to play against. Held here rather than
  // in the job store because the store carries the decoded PCM's *derivatives*,
  // not the file, and an object URL has a lifetime the store should not own.
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setMediaUrl(url);

    return () => {
      URL.revokeObjectURL(url);
      setMediaUrl(null);
    };
  }, [file]);

  // Opened automatically the first time a job finishes, because the transcript is
  // the thing the user came for — landing on a row of download buttons hides it
  // behind a click. Tracked with a ref rather than keyed on `status` alone: the
  // aligner and the M4 re-time both return to 'done', and being thrown back into the
  // editor after deliberately choosing an action from the export panel would fight
  // the user rather than help them.
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (snapshot.status !== 'done' || autoOpenedRef.current) return;
    autoOpenedRef.current = true;
    setEditing(true);
  }, [snapshot.status]);

  const begin = (file: File | undefined) => {
    if (!file) return;
    sendGAEvent({
      event: GA_EVENTS.SUBTITLER_FILE_SELECTED,
      value: file.name,
      event_category: 'tool_usage',
    });
    setFile(file);
    setEditing(false);
    autoOpenedRef.current = false;
    void start(file);
  };

  const onInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    begin(event.target.files?.[0]);
    // Reset so picking the same file twice in a row still fires a change event.
    event.target.value = '';
  };

  const onDrop = (event: React.DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setIsDragging(false);
    begin(event.dataTransfer.files?.[0]);
  };

  const showDropzone = !busy && snapshot.status !== 'done';

  if (editing && snapshot.status === 'done') {
    return (
      <TooltipProvider>
        <TranscriptEditor
          words={snapshot.words}
          cues={snapshot.cues}
          timingSource={snapshot.timingSource}
          fileName={snapshot.fileName ?? 'transcript'}
          duration={snapshot.duration ?? 0}
          mediaUrl={mediaUrl}
          draftKey={file ? draftKey(file, ASR.revision) : null}
          // Both paths commit. "Back" means "return to the export view", not
          // "discard an hour of corrections", and there is no other way out of the
          // editor — so a discarding path here would be a trap rather than a choice.
          onBack={(words, cues) => {
            applyEdits(words, cues);
            setEditing(false);
          }}
          onExport={(words, cues) => {
            applyEdits(words, cues);
            setEditing(false);
          }}
        />
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <div className="mx-auto w-full max-w-2xl">
        <div className="relative overflow-hidden rounded-sm border border-white/60 bg-white/70 p-3 shadow-[0_20px_60px_-20px_rgba(44,51,51,0.25)] backdrop-blur-md md:p-4">
          <AnimatePresence mode="wait">
            {showDropzone && (
              <Dropzone
                key="dropzone"
                reduced={reduced}
                isDragging={isDragging}
                onBrowse={() => inputRef.current?.click()}
                onDragOver={(event) => {
                  event.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={onDrop}
              />
            )}

            {busy && (
              <ProgressPanel
                key="progress"
                reduced={reduced}
                snapshot={snapshot}
                onCancel={reset}
              />
            )}

            {snapshot.status === 'done' && (
              <ExportPanel
                key="export"
                reduced={reduced}
                snapshot={snapshot}
                onReset={reset}
                onRefineTiming={() => void refineTiming()}
                onEdit={() => setEditing(true)}
                onRealignEdits={() => void realignEdits()}
              />
            )}
          </AnimatePresence>

          <input
            ref={inputRef}
            type="file"
            accept="video/*,audio/*"
            onChange={onInputChange}
            className="hidden"
          />

          {snapshot.error && (
            <div
              role="alert"
              className="mt-3 flex items-start gap-2 rounded-sm border border-red-200 bg-red-50 px-4 py-3 text-left"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
              <span className="font-family-inter text-sm text-red-700">
                {snapshot.error.message}
              </span>
            </div>
          )}
        </div>

        <p className="font-family-inter text-ink/40 mt-4 text-center text-xs">
          Everything runs locally in your browser. Your file is never uploaded
          to a server.
        </p>
      </div>
    </TooltipProvider>
  );
}
