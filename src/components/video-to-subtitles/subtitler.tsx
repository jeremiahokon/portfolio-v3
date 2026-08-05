'use client';

import { useRef, useState } from 'react';
import { sendGAEvent } from '@next/third-parties/google';

import { AlertCircle } from 'lucide-react';
import { AnimatePresence } from 'motion/react';

import { GA_EVENTS } from '@/lib/analytics-events';
import { useReducedMotion } from '@/lib/hooks';

import { Dropzone } from './dropzone';
import { ExportPanel } from './export-panel';
import { ProgressPanel } from './progress-panel';
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
  const { snapshot, busy, start, reset } = useSubtitler();
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const begin = (file: File | undefined) => {
    if (!file) return;
    sendGAEvent({
      event: GA_EVENTS.SUBTITLER_FILE_SELECTED,
      value: file.name,
      event_category: 'tool_usage',
    });
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

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="relative overflow-hidden rounded-3xl border border-white/60 bg-white/70 p-3 shadow-[0_20px_60px_-20px_rgba(44,51,51,0.25)] backdrop-blur-md md:p-4">
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
            className="mt-3 flex items-start gap-2 rounded-full border border-red-200 bg-red-50 px-4 py-3 text-left"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
            <span className="font-family-inter text-sm text-red-700">
              {snapshot.error.message}
            </span>
          </div>
        )}
      </div>

      <p className="font-family-inter text-ink/40 mt-4 text-center text-xs">
        Everything runs locally in your browser. Your file is never uploaded to
        a server.
      </p>
    </div>
  );
}
