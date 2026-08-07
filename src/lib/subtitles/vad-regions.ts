import { rms, SILENCE_RMS } from '@/lib/media/decode-pcm';

import type { SpeechRegion } from './types';

/**
 * Turns a per-frame speech-probability series into speech regions.
 *
 * Pure and model-agnostic: the probabilities can come from Silero or from
 * anything else. Separated from the worker on purpose — the thresholding is the
 * part with the subtle bugs, and it is worth testing without a 2 MB download and
 * an ONNX session in the loop.
 */

export interface VadThresholds {
  /** Probability above which speech is considered to have started. */
  speechStart: number;
  /**
   * Probability below which speech is considered to have ended. Deliberately
   * lower than `speechStart`: a single threshold makes the detector chatter on
   * and off through the quiet parts of a word. This is hysteresis, and the gap
   * between the two values is what stops it.
   */
  speechEnd: number;
  /**
   * Seconds of sub-threshold audio required before a region is closed. Stops a
   * plosive or a breath mid-sentence from splitting one utterance into two.
   */
  minSilence: number;
  /** Regions shorter than this are discarded as noise, in seconds. */
  minSpeech: number;
  /**
   * Seconds added to each side of a region. The detector reliably clips the
   * onset of the first phoneme and the tail of the last, and a chunk boundary
   * placed on an unpadded edge cuts into speech.
   */
  pad: number;
}

export const DEFAULT_VAD: VadThresholds = {
  speechStart: 0.5,
  speechEnd: 0.35,
  minSilence: 0.1,
  minSpeech: 0.25,
  pad: 0.03,
};

/**
 * @param probabilities One speech probability per frame, in order.
 * @param frameSeconds Duration of a single frame.
 * @param duration Total audio length, used to clamp the final region's padding.
 */
export function regionsFromProbabilities(
  probabilities: ArrayLike<number>,
  frameSeconds: number,
  duration: number,
  thresholds: VadThresholds = DEFAULT_VAD
): SpeechRegion[] {
  const regions: SpeechRegion[] = [];

  let start: number | null = null;
  // Where the current run of sub-threshold frames began, or null if the last
  // frame was speech. Tracked rather than counted so the closed region ends at
  // the last *speech* frame instead of at the end of the trailing silence.
  let quietSince: number | null = null;

  for (let i = 0; i < probabilities.length; i += 1) {
    const probability = probabilities[i] ?? 0;
    const at = i * frameSeconds;

    if (start === null) {
      if (probability >= thresholds.speechStart) {
        start = at;
        quietSince = null;
      }
      continue;
    }

    if (probability >= thresholds.speechEnd) {
      quietSince = null;
      continue;
    }

    if (quietSince === null) quietSince = at;

    if (at - quietSince >= thresholds.minSilence) {
      regions.push({ start, end: quietSince });
      start = null;
      quietSince = null;
    }
  }

  // Audio that ends mid-speech: close the region at the end of the file rather
  // than dropping it, which would lose the final sentence.
  if (start !== null) {
    regions.push({
      start,
      end: quietSince ?? probabilities.length * frameSeconds,
    });
  }

  return regions
    .filter((region) => region.end - region.start >= thresholds.minSpeech)
    .map((region) => ({
      start: Math.max(0, region.start - thresholds.pad),
      end: Math.min(duration, region.end + thresholds.pad),
    }));
}

/**
 * Drops regions whose audio carries no meaningful energy.
 *
 * The VAD is a speech *classifier*, not an energy gate, so it produces occasional
 * false positives on near-silence — room tone, a Zoom join chime, line noise. The
 * 39-minute fixture shows the consequence exactly: the detector correctly skipped
 * 5.5 minutes of waiting-room silence but admitted about 2 seconds at the very
 * start, and Whisper hallucinated the word "you" out of it. That reached the user
 * as cue #1 of their transcript.
 *
 * The existing whole-file check (`isEffectivelySilent`) cannot catch this, because
 * the file as a whole is not silent — only this region is. Screening per region is
 * the same test applied at the right granularity, and it is strictly better than
 * filtering the resulting text: it prevents the hallucination rather than trying to
 * recognise one afterwards, so it can never delete a genuine quiet word.
 *
 * Deliberately uses the same `SILENCE_RMS` threshold as the whole-file check. One
 * definition of silence, in one place; a region-specific constant would drift.
 */
export function dropSilentRegions(
  regions: SpeechRegion[],
  samples: Float32Array,
  sampleRate: number,
  threshold: number = SILENCE_RMS
): SpeechRegion[] {
  if (regions.length === 0 || sampleRate <= 0) return regions;

  const kept = regions.filter((region) => {
    const from = Math.max(0, Math.floor(region.start * sampleRate));
    const to = Math.min(samples.length, Math.ceil(region.end * sampleRate));
    // An empty slice would make `rms` return NaN, and NaN < threshold is false,
    // which would keep exactly the region with no audio in it.
    if (to <= from) return false;

    return rms(samples.subarray(from, to)) >= threshold;
  });

  // Identity when nothing was dropped, so the common case allocates nothing.
  return kept.length === regions.length ? regions : kept;
}
