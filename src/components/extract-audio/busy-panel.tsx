'use client';

import { m } from 'motion/react';

import { Progress } from '@/ui/progress';

import { EqualizerBars } from './animated-icons';
import { panelMotion } from './panel-motion';
import type { ExtractorStatus } from './use-audio-extractor';

interface BusyPanelProps {
  reduced: boolean;
  status: ExtractorStatus;
  progress: number;
  fileName: string | null;
}

export function BusyPanel({
  reduced,
  status,
  progress,
  fileName,
}: BusyPanelProps) {
  return (
    <m.div
      {...panelMotion(reduced)}
      role="status"
      aria-live="polite"
      className="bg-sky/[0.04] flex flex-col items-center gap-6 rounded-sm p-8 text-center md:p-14"
    >
      <div className="h-20 w-20">
        <EqualizerBars />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-footer-background text-lg font-bold md:text-xl">
          {status === 'loading-engine'
            ? 'Warming up the audio engine…'
            : 'Extracting your audio…'}
        </p>
        <p className="font-family-inter text-ink/55 text-sm">
          {status === 'loading-engine'
            ? 'One-time ~30 MB download — runs fully in your browser.'
            : (fileName ?? 'Working locally, nothing leaves your device.')}
        </p>
      </div>
      {status === 'processing' && (
        <div className="w-full max-w-sm">
          <Progress value={progress} />
          <div className="mt-2 flex items-center justify-between">
            <span className="font-family-inter text-ink/45 text-xs">
              Encoding MP3
            </span>
            <span className="font-family-inter text-sky-text text-sm font-bold tabular-nums">
              {progress}%
            </span>
          </div>
        </div>
      )}
    </m.div>
  );
}
