'use client';

import { m } from 'motion/react';

import { EqualizerBars } from '@/components/extract-audio/animated-icons';
import { panelMotion } from '@/components/extract-audio/panel-motion';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

import type { JobSnapshot } from '@/lib/subtitles/store';
import { downloadRatio } from '@/lib/subtitles/store';
import { formatBytes } from '@/lib/utils';

interface ProgressPanelProps {
  reduced: boolean;
  snapshot: JobSnapshot;
  onCancel: () => void;
}

/**
 * The one busy panel, covering every stage of a job.
 *
 * A single panel rather than one per stage: the stages differ only in their
 * label and which number is meaningful, and swapping panels mid-job would make
 * the layout jump on every transition.
 *
 * Cancelling is always available. Jobs here run for minutes, so a UI with no
 * way out is not acceptable — unlike the extractor, where a job is seconds long.
 */
export function ProgressPanel({
  reduced,
  snapshot,
  onCancel,
}: ProgressPanelProps) {
  const download = snapshot.download;
  const ratio = downloadRatio(snapshot);
  const isDownloading =
    snapshot.status === 'loading-model' && download !== null;

  const { headline, detail, value } = describe(snapshot, ratio);

  return (
    <m.div
      {...panelMotion(reduced)}
      className="border-ink/10 bg-ink/[0.02] flex w-full flex-col items-center gap-6 rounded-2xl border p-8 text-center md:p-14"
      role="status"
      aria-live="polite"
    >
      <span className="relative flex h-20 w-20 items-center justify-center">
        <EqualizerBars />
      </span>

      <span className="flex flex-col gap-1">
        <span className="text-footer-background text-lg font-bold md:text-xl">
          {headline}
        </span>
        <span className="font-family-inter text-ink/60 text-sm">{detail}</span>
      </span>

      <div className="flex w-full max-w-sm flex-col gap-2">
        <Progress value={value * 100} />
        {isDownloading && download && (
          <span className="font-family-inter text-ink/40 text-xs">
            {formatBytes(download.loaded)} of about{' '}
            {formatBytes(download.total)}
          </span>
        )}
      </div>

      {snapshot.backend === 'wasm' && (
        // Disclosed rather than discovered: without WebGPU the runtime falls
        // back to WASM, which is single-threaded here because the site ships
        // without cross-origin isolation, so it is several times slower.
        //
        // Worded without blaming the browser, because this state is also
        // reachable deliberately via ?backend=wasm.
        <span className="font-family-inter text-ink/50 max-w-sm text-xs">
          Running without GPU acceleration, so this will take noticeably longer.
          It will still finish.
        </span>
      )}

      <Button
        variant="ghost"
        onClick={onCancel}
        className="text-ink/70 hover:bg-ink/[0.05] hover:text-ink rounded-full"
      >
        Cancel
      </Button>
    </m.div>
  );
}

function describe(
  snapshot: JobSnapshot,
  ratio: number | null
): { headline: string; detail: string; value: number } {
  switch (snapshot.status) {
    case 'decoding':
      return {
        headline: 'Reading your file',
        detail: 'Extracting the audio track and resampling it for the model.',
        value: snapshot.stageProgress,
      };
    case 'loading-model':
      return {
        headline: 'Downloading the speech model',
        detail:
          'A one-time download. Your browser caches it, so next time is instant.',
        value: ratio ?? 0,
      };
    case 'transcribing':
      // Two very different stages share this status. Saying "Transcribing"
      // during voice detection would be a lie, and a visibly wrong label makes
      // a long job feel stuck.
      if (snapshot.stage === 'vad') {
        return {
          headline: 'Finding the speech',
          detail: 'Locating pauses, so no subtitle gets cut off mid-word.',
          value: snapshot.stageProgress,
        };
      }

      return {
        headline: 'Transcribing',
        // Naming the current window gives the user something that visibly moves
        // during a stage where the model itself reports no progress at all.
        detail:
          snapshot.chunkCount > 1
            ? `Section ${snapshot.chunkIndex} of ${snapshot.chunkCount}, entirely on your device.`
            : snapshot.duration !== null
              ? `Working through ${formatDuration(snapshot.duration)} of audio, entirely on your device.`
              : 'Running the model on your device.',
        value: snapshot.stageProgress,
      };
    case 'building':
      return {
        headline: 'Building subtitles',
        detail: 'Grouping words into readable cues.',
        value: snapshot.stageProgress,
      };
    default:
      return { headline: 'Working', detail: '', value: 0 };
  }
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (minutes === 0) return `${secs}s`;

  return `${minutes}m ${String(secs).padStart(2, '0')}s`;
}
