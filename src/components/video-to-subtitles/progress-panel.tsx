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

// One panel for every stage, not one per stage, so the layout doesn't jump on transitions.
// Cancel is always available: jobs here run for minutes, unlike the extractor's.
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
      className="border-ink/10 bg-ink/[0.02] flex w-full flex-col items-center gap-6 rounded-sm border p-8 text-center md:p-14"
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
        <span className="font-family-inter text-ink/80 text-sm">{detail}</span>
      </span>

      <div className="flex w-full max-w-sm flex-col gap-2">
        <Progress value={value * 100} />
        {isDownloading && download && (
          <span className="font-family-inter text-ink/75 text-xs">
            {formatBytes(download.loaded)} of about{' '}
            {formatBytes(download.total)}
          </span>
        )}
      </div>

      {snapshot.backend === 'wasm' && (
        // Single-threaded WASM fallback (no cross-origin isolation here) is several times slower;
        // also reachable deliberately via ?backend=wasm, so worded without blaming the browser.
        <span className="font-family-inter text-ink/75 max-w-sm text-xs">
          Running without GPU acceleration, so this will take noticeably longer.
          It will still finish.
        </span>
      )}

      {snapshot.notice && (
        // Capability warning, not an error: the job keeps running rather than refusing outright on a guess.
        <span className="font-family-inter max-w-sm rounded-sm border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {snapshot.notice}
        </span>
      )}

      <Button
        variant="ghost"
        onClick={onCancel}
        className="text-ink/85 hover:bg-ink/[0.05] hover:text-ink rounded-sm"
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
    case 'checking-device':
      return {
        headline: 'Checking your device',
        detail: 'Making sure your browser can handle this before you upload.',
        value: 0,
      };
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
      // Voice detection and transcription share this status; labeling both "Transcribing" would be a lie.
      if (snapshot.stage === 'vad') {
        return {
          headline: 'Finding the speech',
          detail: 'Locating pauses, so no subtitle gets cut off mid-word.',
          value: snapshot.stageProgress,
        };
      }

      return {
        headline: 'Transcribing',
        // names the current window since Whisper itself reports no progress mid-inference
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
