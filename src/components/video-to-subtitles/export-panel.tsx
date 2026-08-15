'use client';

import { useEffect, useMemo, useState } from 'react';
import { sendGAEvent } from '@next/third-parties/google';

import { Clock3 } from 'lucide-react';
import { m } from 'motion/react';

import { SuccessCheck } from '@/components/extract-audio/animated-icons';
import { panelMotion } from '@/components/extract-audio/panel-motion';
import { Button } from '@/components/ui/button';
import {
  AudioGlyph,
  DownloadGlyph,
  EditGlyph,
  RestartGlyph,
  WandGlyph,
} from '@/components/ui/glyphs';
import { Tooltip } from '@/components/ui/tooltip';

import { GA_EVENTS } from '@/lib/analytics-events';
import { isModelCached } from '@/lib/models/cache-manager';
import { ALIGNER } from '@/lib/models/config';
import {
  EXPORT_EXTENSION,
  EXPORT_MIME,
  type ExportFormat,
  serialize,
} from '@/lib/subtitles/export';
import type { JobSnapshot } from '@/lib/subtitles/store';
import { baseName, cn, formatBytes } from '@/lib/utils';

interface ExportPanelProps {
  reduced: boolean;
  snapshot: JobSnapshot;
  onReset: () => void;
  onRefineTiming: () => void;
  onEdit: () => void;
  onRealignEdits: () => void;
  onExportMp3: () => Promise<Blob | null>;
}

/** One line on what each format is actually for. */
const FORMAT_HELP: Record<ExportFormat, string> = {
  srt: 'The most widely supported subtitle file. Load it alongside your video in almost any player or editor.',
  vtt: 'The web standard. Use it with an HTML <track> element, or where a platform asks for WebVTT.',
  json: 'Every word with its own start, end and confidence. For piping into your own tooling rather than for a player.',
};

const FORMATS: Array<{ id: ExportFormat; label: string; hint: string }> = [
  { id: 'srt', label: 'SRT', hint: 'Works everywhere' },
  { id: 'vtt', label: 'VTT', hint: 'For the web' },
  { id: 'json', label: 'JSON', hint: 'Raw word data' },
];

export function ExportPanel({
  reduced,
  snapshot,
  onReset,
  onRefineTiming,
  onEdit,
  onRealignEdits,
  onExportMp3,
}: ExportPanelProps) {
  const [format, setFormat] = useState<ExportFormat>('srt');
  const [mp3, setMp3] = useState<'idle' | 'working' | 'failed'>('idle');

  /**
   * Whether the aligner is already on this device.
   *
   * Quoting "+180 MB download" to someone who downloaded it last week is simply
   * false, and it is false in the direction that costs the most: it talks them
   * out of the one action on this panel that makes their timings accurate. Starts
   * `null` — unknown — so the size is neither promised nor denied for the tick
   * before the cache answers.
   */
  const [alignerCached, setAlignerCached] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    void isModelCached(ALIGNER.id, ALIGNER.revision, ALIGNER.weightFiles).then(
      (cached) => {
        if (live) setAlignerCached(cached);
      }
    );

    return () => {
      live = false;
    };
  }, []);

  /**
   * Encodes the MP3 and hands it straight to the browser.
   *
   * Not cached: someone who wants the audio wants it once, and holding a
   * multi-megabyte Blob alive for a second click nobody makes is worse than
   * re-encoding for the rare person who does.
   */
  const downloadMp3 = async () => {
    setMp3('working');
    const blob = await onExportMp3();
    if (!blob) {
      setMp3('failed');

      return;
    }

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${baseName(snapshot.fileName ?? 'audio')}.mp3`;
    anchor.click();
    URL.revokeObjectURL(url);
    setMp3('idle');
  };

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
      className="border-ink/10 bg-ink/[0.02] flex w-full flex-col items-center gap-6 rounded-sm border p-8 text-center md:p-14"
    >
      <span className="relative flex h-20 w-20 items-center justify-center">
        <SuccessCheck />
      </span>

      <span className="flex flex-col gap-1">
        <span className="text-footer-background text-lg font-bold md:text-xl">
          Your subtitles are ready
        </span>
        <span className="font-family-inter text-ink/80 text-sm">
          {cueCount.toLocaleString()} cues from {wordCount.toLocaleString()}{' '}
          words
        </span>
      </span>

      {snapshot.timingSource === 'estimated' ? (
        // Said plainly rather than buried: these timings come from the speech
        // recogniser's ~1s-granular segment bounds, not from a forced aligner.
        // The offer to fix it sits right next to the admission, with its cost
        // stated, so the trade is the user's to make rather than a surprise.
        <div className="border-ink/10 bg-ink/[0.03] flex w-full max-w-md flex-col items-center gap-3 rounded-sm border px-5 py-4">
          <Tooltip label="The speech model reports roughly one-second granularity, so each word's start is worked out by sharing its cue's span across the words in it. Good enough to caption with; not frame-accurate.">
            <span className="font-family-inter text-ink/85 inline-flex cursor-help items-center gap-2 text-xs">
              <Clock3 className="text-sky-text h-4 w-4" />
              Timings are estimated to about a second
            </span>
          </Tooltip>
          <Tooltip
            label={
              alignerCached
                ? 'Measures where each word actually starts and ends, instead of estimating. The model is already stored on this device, so nothing is downloaded. Your transcript is kept exactly as it is if the upgrade fails.'
                : 'Downloads a second model that measures where each word actually starts and ends, instead of estimating. It runs on your device like the first one. Your transcript is kept exactly as it is if the upgrade fails.'
            }
          >
            <button
              type="button"
              onClick={onRefineTiming}
              className="group border-sky-deep/40 text-sky-text hover:bg-sky/10 font-family-inter inline-flex max-w-full flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-sm border px-4 py-2 text-xs font-medium transition-all"
            >
              <WandGlyph className="shrink-0" />
              Improve timing accuracy
              {alignerCached === false && (
                <span className="text-ink/75 whitespace-nowrap">
                  +{formatBytes(ALIGNER.approxBytes)} download
                </span>
              )}
              {alignerCached === true && (
                <span className="whitespace-nowrap text-emerald-700">
                  already downloaded
                </span>
              )}
            </button>
          </Tooltip>
        </div>
      ) : (
        <Tooltip label="The remaining words kept their estimated timing, either because the audio did not clearly support a measurement or because the word cannot be measured at all — the aligner's vocabulary has no digits or symbols.">
          <span className="font-family-inter inline-flex cursor-help items-center gap-2 rounded-sm border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs text-emerald-700">
            <Clock3 className="h-4 w-4" />
            Word-level timing measured for{' '}
            {snapshot.alignedWords.toLocaleString()} of{' '}
            {wordCount.toLocaleString()} words
          </span>
        </Tooltip>
      )}

      {snapshot.timingSource === 'aligned' &&
        snapshot.words.some((word) => word.edited) && (
          // M4. Only offered once the aligner has run, because that is the only
          // state where "your edits have estimated timing while everything else is
          // measured" is true — and it is a real inconsistency worth fixing.
          <Tooltip label="Re-measures word timing for the parts you edited, and only those. The aligner is already downloaded, so this takes seconds rather than another full pass. Boundaries you dragged yourself are left alone.">
            <button
              type="button"
              onClick={onRealignEdits}
              className="group border-sky-deep/40 text-sky-text hover:bg-sky/10 font-family-inter inline-flex items-center gap-2 rounded-sm border px-4 py-2 text-xs font-medium whitespace-nowrap transition-all"
            >
              <WandGlyph />
              Re-time your edits
            </button>
          </Tooltip>
        )}

      <div className="flex flex-wrap items-center justify-center gap-2">
        {FORMATS.map((option) => (
          <Tooltip key={option.id} label={FORMAT_HELP[option.id]}>
            <button
              type="button"
              onClick={() => setFormat(option.id)}
              aria-pressed={format === option.id}
              className={cn(
                'font-family-inter rounded-sm border px-4 py-2 text-xs font-medium transition-all',
                format === option.id
                  ? 'border-sky-deep bg-sky/15 text-sky-text'
                  : 'border-ink/10 text-ink/80 hover:border-sky/40 hover:text-ink'
              )}
            >
              {option.label}
              <span className="text-ink/75 ml-2">{option.hint}</span>
            </button>
          </Tooltip>
        ))}
      </div>

      <div className="flex w-full max-w-full flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={download}
          className="group from-sky to-sky-deep inline-flex items-center gap-2 rounded-sm bg-gradient-to-r px-6 py-3 text-xs font-bold tracking-wide whitespace-nowrap text-white uppercase shadow-lg transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_0_40px_rgba(123,182,221,0.45)]"
        >
          <DownloadGlyph />
          Download {format.toUpperCase()}
        </button>

        <Button
          variant="ghost"
          onClick={onReset}
          className="group text-ink/85 hover:bg-ink/[0.05] hover:text-ink font-family-inter h-auto rounded-sm px-4 py-2 text-xs font-medium"
        >
          <RestartGlyph className="mr-2" />
          Transcribe another
        </Button>

        <Tooltip label="Extracts the original audio as a high-quality MP3 — the same file the audio extractor produces. Encoded when you ask for it, so it costs nothing unless you want it.">
          <button
            type="button"
            onClick={() => void downloadMp3()}
            disabled={mp3 === 'working'}
            className="group border-ink/15 text-ink hover:bg-ink/[0.04] disabled:text-ink/75 font-family-inter inline-flex items-center gap-2 rounded-sm border px-4 py-2 text-xs font-medium whitespace-nowrap transition-all"
          >
            <AudioGlyph />
            {mp3 === 'working'
              ? 'Encoding MP3…'
              : mp3 === 'failed'
                ? 'MP3 failed — retry'
                : 'Also get the MP3'}
          </button>
        </Tooltip>

        <Tooltip label="Read the transcript alongside the audio and fix what the model misheard — names and acronyms especially. Correcting a word never moves its timing.">
          <button
            type="button"
            onClick={onEdit}
            className="group border-ink/15 text-ink hover:bg-ink/[0.04] font-family-inter inline-flex items-center gap-2 rounded-sm border px-4 py-2 text-xs font-medium whitespace-nowrap transition-all"
          >
            <EditGlyph />
            Edit transcript
          </button>
        </Tooltip>
      </div>
    </m.div>
  );
}
