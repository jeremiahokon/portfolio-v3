'use client';

import { useEffect, useRef, useState } from 'react';
import { sendGAEvent } from '@next/third-parties/google';

import { AlertCircle } from 'lucide-react';
import { AnimatePresence } from 'motion/react';

import { GA_EVENTS } from '@/lib/analytics-events';
import { useReducedMotion } from '@/lib/hooks';
import { ASR } from '@/lib/models/config';
import {
  clearJobInFlight,
  draftKey,
  type InFlightJob,
  peekInterruptedJob,
} from '@/lib/subtitles/persist';

import { TooltipProvider } from '@/custom/tooltip';

import { Dropzone } from './dropzone';
import { ExportPanel } from './export-panel';
import { ModelManager } from './model-manager';
import { ProgressPanel } from './progress-panel';
import { TranscriptEditor } from './transcript-editor';
import { useSubtitler } from './use-subtitler';

// Exactly one keyed panel rendered at a time via AnimatePresence mode="wait", matching the extractor.
export function Subtitler() {
  const reduced = useReducedMotion();
  const {
    snapshot,
    busy,
    start,
    reset,
    refineTiming,
    realignEdits,
    exportMp3,
    applyEdits,
  } = useSubtitler();
  const [isDragging, setIsDragging] = useState(false);
  const [editing, setEditing] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Held here, not in the job store: the store carries the decoded PCM's derivatives, not
  // the file, and an object URL's lifetime shouldn't be owned by the store.
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

  // Non-destructive read (see peekInterruptedJob) of whether the last run died with the tab:
  // a memory-killed tab reloads silently otherwise, and the user just thinks the tool is broken.
  const [interrupted, setInterrupted] = useState<InFlightJob | null>(null);
  useEffect(() => {
    setInterrupted(peekInterruptedJob());
  }, []);

  // Ref, not `status`, because the aligner and M4 re-time both also land on 'done': this
  // must fire only once, the first time a job finishes.
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
    clearJobInFlight(); // previous run's marker has been shown; a new job writes its own past decode
    setInterrupted(null);
    autoOpenedRef.current = false;
    void start(file);
  };

  const onInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    begin(event.target.files?.[0]);
    event.target.value = ''; // so picking the same file twice in a row still fires a change event
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
          // Both paths commit: "Back" means return to the export view, never discard edits.
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
                onExportMp3={exportMp3}
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

          {interrupted && !snapshot.error && (
            <div
              role="status"
              className="mt-3 flex items-start gap-2 rounded-sm border border-amber-200 bg-amber-50 px-4 py-3 text-left"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <span className="font-family-inter text-sm text-amber-800">
                Transcribing “{interrupted.fileName}” stopped before it
                finished, most likely because this browser ran out of memory.
                Safari is the strictest about this. A shorter clip, or Chrome or
                Edge, will usually get through it.
              </span>
            </div>
          )}

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

        <p className="font-family-inter text-ink/75 mt-4 text-center text-xs">
          Everything runs locally in your browser. Your file is never uploaded
          to a server.
        </p>

        {/* Renders nothing until something is actually cached. */}
        <ModelManager />
      </div>
    </TooltipProvider>
  );
}
