'use client';

import { useRef, useState } from 'react';
import { sendGAEvent } from '@next/third-parties/google';

import { AnimatePresence, m } from 'motion/react';

import { GA_EVENTS } from '@/lib/analytics-events';
import { useReducedMotion } from '@/lib/hooks';

import { BusyPanel } from './busy-panel';
import { Dropzone } from './dropzone';
import { ResultPanel } from './result-panel';
import { ACCEPTED_EXTENSIONS, useAudioExtractor } from './use-audio-extractor';

// Thin container: state lives in useAudioExtractor, the three swapped panels
// are purely presentational.
export default function AudioExtractor() {
  const reduced = useReducedMotion();
  const { status, error, progress, fileName, result, busy, extract, reset } =
    useAudioExtractor();

  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const startExtraction = (file: File) => {
    sendGAEvent({
      event: GA_EVENTS.EXTRACTOR_FILE_SELECTED,
      value: file.name.split('.').pop()?.toLowerCase() ?? 'unknown',
      file_extension: file.name.split('.').pop()?.toLowerCase() ?? 'unknown',
      event_category: 'tool_usage',
    });
    void extract(file);
  };

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) startExtraction(file);
    e.target.value = '';
  };

  const onDrop = (e: React.DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (busy) return;
    const file = e.dataTransfer.files?.[0];
    if (file) startExtraction(file);
  };

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="relative overflow-hidden rounded-3xl border border-white/60 bg-white/70 p-3 shadow-[0_20px_60px_-20px_rgba(44,51,51,0.25)] backdrop-blur-md md:p-4">
        <AnimatePresence mode="wait">
          {status === 'done' && result ? (
            <ResultPanel
              key="done"
              reduced={reduced}
              result={result}
              onReset={reset}
            />
          ) : busy ? (
            <BusyPanel
              key="busy"
              reduced={reduced}
              status={status}
              progress={progress}
              fileName={fileName}
            />
          ) : (
            <Dropzone
              key="idle"
              reduced={reduced}
              isDragging={isDragging}
              onBrowse={() => inputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setIsDragging(false);
              }}
              onDrop={onDrop}
            />
          )}
        </AnimatePresence>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={`video/*,${ACCEPTED_EXTENSIONS.join(',')}`}
        onChange={onInputChange}
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
      />

      {/* Error */}
      <AnimatePresence>
        {error && (
          <m.p
            role="alert"
            initial={reduced ? undefined : { opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? undefined : { opacity: 0 }}
            className="font-family-inter mt-4 flex items-center justify-center gap-2 rounded-full border border-red-500/20 bg-red-500/[0.06] px-4 py-2.5 text-center text-sm text-red-600"
          >
            {error}
          </m.p>
        )}
      </AnimatePresence>

      <p className="font-family-inter text-ink/45 mt-5 text-center text-xs">
        Everything runs locally in your browser using WebAssembly. Your video is
        never uploaded to a server.
      </p>
    </div>
  );
}
