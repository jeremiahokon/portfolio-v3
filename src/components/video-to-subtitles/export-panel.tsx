'use client';

import { useMemo, useState } from 'react';
import { sendGAEvent } from '@next/third-parties/google';

import { Clock3, Download, RotateCcw } from 'lucide-react';
import { m } from 'motion/react';

import { SuccessCheck } from '@/components/extract-audio/animated-icons';
import { panelMotion } from '@/components/extract-audio/panel-motion';
import { Button } from '@/components/ui/button';

import { GA_EVENTS } from '@/lib/analytics-events';
import {
  EXPORT_EXTENSION,
  EXPORT_MIME,
  type ExportFormat,
  serialize,
} from '@/lib/subtitles/export';
import type { JobSnapshot } from '@/lib/subtitles/store';
import { baseName, cn } from '@/lib/utils';

interface ExportPanelProps {
  reduced: boolean;
  snapshot: JobSnapshot;
  onReset: () => void;
}

const FORMATS: Array<{ id: ExportFormat; label: string; hint: string }> = [
  { id: 'srt', label: 'SRT', hint: 'Works everywhere' },
  { id: 'vtt', label: 'VTT', hint: 'For the web' },
  { id: 'json', label: 'JSON', hint: 'Raw word data' },
];

export function ExportPanel({ reduced, snapshot, onReset }: ExportPanelProps) {
  const [format, setFormat] = useState<ExportFormat>('srt');

  const wordCount = snapshot.words.length;
  const cueCount = snapshot.cues.length;

  // Serialising is cheap, but doing it on every render of a 10k-word transcript
  // is still waste. Recompute only when the format or the transcript changes.
  const content = useMemo(
    () => serialize(format, snapshot.words, snapshot.cues),
    [format, snapshot.words, snapshot.cues]
  );

  const download = () => {
    const name = `${baseName(snapshot.fileName ?? 'subtitles')}${EXPORT_EXTENSION[format]}`;
    const blob = new Blob([content], { type: EXPORT_MIME[format] });
    const url = URL.createObjectURL(blob);

    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    // Revoke on the next tick rather than immediately: revoking synchronously
    // can cancel the download in some browsers before it starts reading.
    setTimeout(() => URL.revokeObjectURL(url), 0);

    sendGAEvent({
      event: GA_EVENTS.SUBTITLER_EXPORTED,
      value: format,
      event_category: 'tool_usage',
    });
  };

  return (
    <m.div
      {...panelMotion(reduced)}
      className="border-ink/10 bg-ink/[0.02] flex w-full flex-col items-center gap-6 rounded-2xl border p-8 text-center md:p-14"
    >
      <span className="relative flex h-20 w-20 items-center justify-center">
        <SuccessCheck />
      </span>

      <span className="flex flex-col gap-1">
        <span className="text-footer-background text-lg font-bold md:text-xl">
          Your subtitles are ready
        </span>
        <span className="font-family-inter text-ink/60 text-sm">
          {cueCount.toLocaleString()} cues from {wordCount.toLocaleString()}{' '}
          words
        </span>
      </span>

      {snapshot.timingSource === 'estimated' && (
        // Said plainly rather than buried: these timings come from the speech
        // recogniser's ~1s-granular segment bounds, not from a forced aligner.
        <span className="border-ink/10 bg-ink/[0.03] text-ink/70 font-family-inter inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs">
          <Clock3 className="text-sky-deep h-4 w-4" />
          Timings are estimated to about a second
        </span>
      )}

      <div className="flex flex-wrap items-center justify-center gap-2">
        {FORMATS.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setFormat(option.id)}
            aria-pressed={format === option.id}
            className={cn(
              'font-family-inter rounded-full border px-4 py-2 text-xs font-medium transition-all',
              format === option.id
                ? 'border-sky-deep bg-sky/15 text-sky-deep'
                : 'border-ink/10 text-ink/60 hover:border-sky/40 hover:text-ink'
            )}
          >
            {option.label}
            <span className="text-ink/40 ml-2">{option.hint}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-col items-center gap-4 sm:flex-row">
        <button
          type="button"
          onClick={download}
          className="from-sky to-sky-deep inline-flex items-center gap-2 rounded-full bg-gradient-to-r px-8 py-3.5 text-sm font-bold tracking-wide text-white uppercase shadow-lg transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_0_40px_rgba(123,182,221,0.45)]"
        >
          <Download className="h-4 w-4" />
          Download {format.toUpperCase()}
        </button>

        <Button
          variant="ghost"
          onClick={onReset}
          className="text-ink/70 hover:bg-ink/[0.05] hover:text-ink rounded-full"
        >
          <RotateCcw className="mr-2 h-4 w-4" />
          Transcribe another
        </Button>
      </div>
    </m.div>
  );
}
