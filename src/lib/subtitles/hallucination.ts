import { SILENCE_RMS } from '@/lib/media/decode-pcm';

import type { AsrSegment } from './types';

/**
 * Drops Whisper's stock hallucinations on non-speech audio.
 *
 * The 39-minute Zoom call opens with a cue reading `"you"` over the first two
 * seconds, followed by 333 seconds of nothing. There is no speech there — it is the
 * waiting-room join chime — and Whisper produced a word from it.
 *
 * **`dropSilentRegions` cannot catch this, and was right not to.** That gate drops
 * *silence*, and a join chime is *noise*: its RMS clears `SILENCE_RMS` comfortably.
 * Raising the silence threshold until it caught this would start discarding quietly
 * spoken words, which is a far worse trade than leaving one bogus cue in.
 *
 * So this is a narrower instrument. Whisper's hallucinations on non-speech are not
 * arbitrary — the model was trained on captioned video and falls back on the phrases
 * that pad the end of one. That makes them recognisable, but recognisable text alone
 * is nowhere near enough to delete on: people really do say "thank you" and "bye".
 *
 * **All three conditions are required**, and each rules out a different way of being
 * wrong about it:
 *
 * 1. **The text is a known stock phrase.** Necessary, and on its own worthless.
 * 2. **The segment is isolated** — seconds of nothing on both sides. Speech in a
 *    conversation has neighbours; a hallucination invented from room tone does not.
 * 3. **The audio is nearly silent** — quiet enough that no one could have been
 *    speaking, but above the point where `dropSilentRegions` would already have
 *    removed the region.
 *
 * A real, quietly-spoken, completely isolated "thank you" would still be dropped.
 * That is the one false positive this design accepts, it needs all three conditions
 * to line up, and the alternative — presenting invented words as transcript — is
 * worse. The editor also shows the result before anything is exported.
 */

/**
 * Phrases Whisper falls back on when there is nothing to transcribe.
 *
 * Deliberately short and literal rather than a clever pattern. Every entry here is
 * a phrase a human might genuinely say, so the list is doing none of the work on its
 * own — conditions 2 and 3 are. A longer list would widen the blast radius without
 * making the detection more certain.
 */
const STOCK_PHRASES = new Set([
  'you',
  'thankyou',
  'thankyouverymuch',
  'thanksforwatching',
  'pleasesubscribe',
  'subscribe',
  'bye',
  'byebye',
  'music',
  'applause',
  'silence',
  'blank_audio',
  'inaudible',
  'foreign',
]);

/**
 * Seconds of nothing required on each side.
 *
 * Two seconds is longer than a conversational pause and far shorter than the gap
 * around a genuine hallucination, which is typically an entire stretch of silence.
 */
export const ISOLATION_GAP = 2;

/**
 * RMS below which no one was speaking.
 *
 * Five times `SILENCE_RMS`, so this fires on the band between "provably silent" —
 * already handled upstream — and "quiet". A measured clear utterance on this
 * material sat at RMS 0.146, more than an order of magnitude above, so ordinary
 * speech is nowhere near this line.
 */
export const QUIET_RMS = SILENCE_RMS * 5;

function key(text: string): string {
  return text.toLowerCase().replaceAll(/[^\p{L}\p{N}]/gu, '');
}

export interface HallucinationOptions {
  /** RMS of the decoded audio over `[start, end]` in seconds. */
  rmsAt: (start: number, end: number) => number;
  isolationGap?: number;
  quietRms?: number;
}

export function dropHallucinations(
  segments: AsrSegment[],
  options: HallucinationOptions
): AsrSegment[] {
  if (segments.length === 0) return segments;

  const gap = options.isolationGap ?? ISOLATION_GAP;
  const quiet = options.quietRms ?? QUIET_RMS;

  const kept = segments.filter((segment, index) => {
    if (!STOCK_PHRASES.has(key(segment.text))) return true;

    const previous = segments[index - 1];
    const next = segments[index + 1];
    // A segment at either end of the file has nothing on that side, which counts
    // as isolated — the leading-silence case is exactly the one being fixed.
    const before = previous ? segment.start - previous.end : Number.POSITIVE_INFINITY;
    const after = next ? next.start - segment.end : Number.POSITIVE_INFINITY;
    if (before < gap || after < gap) return true;

    return options.rmsAt(segment.start, segment.end) >= quiet;
  });

  return kept.length === segments.length ? segments : kept;
}

/** Builds an `rmsAt` probe over decoded PCM. */
export function rmsProbe(
  samples: Float32Array,
  sampleRate: number
): (start: number, end: number) => number {
  return (start, end) => {
    const from = Math.max(0, Math.floor(start * sampleRate));
    const to = Math.min(samples.length, Math.ceil(end * sampleRate));
    if (to <= from) return 0;

    let sum = 0;
    for (let i = from; i < to; i += 1) sum += samples[i]! * samples[i]!;

    return Math.sqrt(sum / (to - from));
  };
}
