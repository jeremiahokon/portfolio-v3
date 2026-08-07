'use client';

import { FileVideo } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';

import { cn } from '@/lib/utils';

import { UploadCloudAnim } from './animated-icons';
import { panelMotion } from './panel-motion';

interface DropzoneProps {
  reduced: boolean;
  isDragging: boolean;
  onBrowse: () => void;
  onDragOver: React.DragEventHandler<HTMLButtonElement>;
  onDragLeave: React.DragEventHandler<HTMLButtonElement>;
  onDrop: React.DragEventHandler<HTMLButtonElement>;
}

// One real <button> is the whole drop target — keyboard-native, no nested
// interactive elements. The "Choose a video" pill inside is just a styled span.
export function Dropzone({
  reduced,
  isDragging,
  onBrowse,
  onDragOver,
  onDragLeave,
  onDrop,
}: DropzoneProps) {
  return (
    <m.button
      {...panelMotion(reduced)}
      type="button"
      // No aria-label. The accessible name has to contain the visible text, and the
      // visible text here is three lines — headline, hint, accepted formats — so any
      // label short enough to be useful fails the check, and one long enough to pass
      // duplicates copy that will drift. The rendered text already reads as an
      // instruction, which is what a screen reader and voice control both want.
      onClick={onBrowse}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        'group relative flex w-full cursor-pointer flex-col items-center justify-center gap-5 overflow-hidden rounded-sm border-2 border-dashed p-8 text-center transition-all duration-300 outline-none md:p-14',
        isDragging
          ? 'border-sky-deep bg-sky/10 scale-[1.01]'
          : 'border-ink/15 bg-ink/[0.02] hover:border-sky/50 hover:bg-sky/[0.04] focus-visible:border-sky/60'
      )}
    >
      {/* Drag-over ripple */}
      <AnimatePresence>
        {isDragging && !reduced && (
          <m.span
            key="ripple"
            className="bg-sky/10 pointer-events-none absolute inset-0 rounded-sm"
            initial={{ opacity: 0.5, scale: 0.9 }}
            animate={{ opacity: 0, scale: 1.05 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8, repeat: Infinity }}
          />
        )}
      </AnimatePresence>

      {/* Icon with soft pulsing glow */}
      <span className="relative flex h-20 w-20 items-center justify-center">
        {!reduced && (
          <m.span
            className="bg-sky/20 absolute inset-0 rounded-sm blur-xl"
            animate={{
              opacity: [0.4, 0.8, 0.4],
              scale: [0.9, 1.05, 0.9],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
        )}
        <span className="relative flex h-16 w-16 items-center justify-center">
          <UploadCloudAnim />
        </span>
      </span>

      <span className="relative flex flex-col gap-1">
        <span className="text-footer-background text-lg font-bold md:text-xl">
          {isDragging ? 'Release to extract' : 'Drop your video here'}
        </span>
        <span className="font-family-inter text-ink/80 text-sm">
          or click to browse
        </span>
      </span>

      <span className="from-sky to-sky-deep hover:from-sky-deep hover:to-sky relative inline-flex items-center gap-2 rounded-sm bg-gradient-to-r px-6 py-2.5 text-sm font-medium text-white transition-all">
        <FileVideo className="h-4 w-4" />
        Choose a video
      </span>

      <span className="font-family-inter text-ink/75 relative text-xs">
        MP4 · MOV · MKV · AVI · WEBM · M4V — up to 1 GB
      </span>
    </m.button>
  );
}
