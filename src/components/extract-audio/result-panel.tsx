'use client';

import { sendGAEvent } from '@next/third-parties/google';

import { AudioLines, RotateCcw } from 'lucide-react';
import { m } from 'motion/react';

import { Button } from '@/ui/button';

import { GA_EVENTS } from '@/lib/analytics-events';

import { SuccessCheck } from './animated-icons';
import { panelMotion } from './panel-motion';
import type { ExtractionResult } from './use-audio-extractor';

interface ResultPanelProps {
  reduced: boolean;
  result: ExtractionResult;
  onReset: () => void;
}

export function ResultPanel({ reduced, result, onReset }: ResultPanelProps) {
  return (
    <m.div
      {...panelMotion(reduced)}
      className="flex flex-col items-center gap-6 rounded-sm bg-gradient-to-b from-emerald-500/[0.06] to-transparent p-8 text-center md:p-12"
    >
      <div className="h-20 w-20">
        <SuccessCheck />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-footer-background text-xl font-bold md:text-2xl">
          Your MP3 is ready
        </p>
        <p className="font-family-inter text-ink/60 flex items-center justify-center gap-2 text-sm">
          <AudioLines className="text-sky-deep h-4 w-4" />
          {result.name}
        </p>
      </div>

      <audio controls src={result.url} className="w-full max-w-sm" />

      <div className="flex flex-col items-center gap-3 sm:flex-row">
        <a
          href={result.url}
          download={result.name}
          onClick={() => {
            sendGAEvent({
              event: GA_EVENTS.EXTRACTOR_MP3_DOWNLOADED,
              value: result.name,
              event_category: 'tool_usage',
            });
          }}
          className="group from-sky to-sky-deep inline-flex items-center justify-center gap-2 rounded-sm bg-gradient-to-r px-8 py-3.5 text-sm font-bold tracking-wide text-white uppercase shadow-lg transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_0_40px_rgba(123,182,221,0.45)] whitespace-nowrap"
        >
          Download MP3
        </a>
        <Button
          variant="ghost"
          onClick={onReset}
          className="text-ink/70 hover:bg-ink/[0.05] hover:text-ink rounded-sm"
        >
          <RotateCcw className="h-4 w-4" />
          Extract another
        </Button>
      </div>
    </m.div>
  );
}
