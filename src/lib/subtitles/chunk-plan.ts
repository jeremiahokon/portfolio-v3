import type { Chunk, SpeechRegion } from './types';

/**
 * Turns speech regions into analysis windows whose boundaries land in silence.
 *
 * Pure: no DOM, no worker, no model. It does not care whether the regions came
 * from a neural VAD or an energy detector, which is what makes both usable and
 * this function testable without either.
 *
 * **Why boundaries must land in silence.** Whisper is autoregressive and decodes
 * each window independently. Cutting mid-word gives it half a word at the end of
 * one window and half at the start of the next, and it will confidently invent a
 * whole word from each fragment. Cutting in a pause costs nothing.
 */

export interface ChunkPlanOptions {
  /** Preferred window length in seconds. Whisper is trained on 30 s. */
  target: number;
  /**
   * Hard ceiling in seconds. A window longer than this is split even if that
   * means cutting through speech, because exceeding the model's receptive field
   * silently truncates audio — a worse failure than one bad boundary.
   */
  max: number;
  /**
   * Seconds of neighbouring audio included for context on each side. Words in
   * the overlap are dropped when stitching, since the adjacent chunk owns them.
   */
  overlap: number;
}

export const DEFAULT_CHUNK_PLAN: ChunkPlanOptions = {
  target: 28,
  // Slightly under Whisper's 30 s receptive field: `target` plus two overlaps
  // must still fit, or the context we add to help the model would push real
  // audio out of the window.
  max: 30,
  overlap: 1,
};

/**
 * Plans windows over `duration` seconds of audio.
 *
 * With no speech regions at all — silence, or a VAD that found nothing — returns
 * fixed windows rather than an empty plan. Returning nothing would silently
 * transcribe none of the file, and a VAD false negative should degrade to
 * "transcribe it blind", not to "produce an empty transcript".
 */
export function planChunks(
  regions: SpeechRegion[],
  duration: number,
  options: ChunkPlanOptions = DEFAULT_CHUNK_PLAN
): Chunk[] {
  if (duration <= 0) return [];

  const merged = mergeRegions(regions);
  if (merged.length === 0) return fixedChunks(duration, options);

  const cuts = chooseCuts(merged, duration, options);

  return toChunks(cuts, duration, options);
}

/**
 * Merges overlapping or touching regions and drops empty ones.
 *
 * A VAD emitting per-frame regions produces hundreds of adjacent slivers;
 * planning over them directly would treat every frame gap as a cut candidate.
 */
export function mergeRegions(regions: SpeechRegion[]): SpeechRegion[] {
  const sorted = [...regions]
    .filter((region) => region.end > region.start)
    .sort((a, b) => a.start - b.start);

  const merged: SpeechRegion[] = [];

  for (const region of sorted) {
    const last = merged.at(-1);
    if (last && region.start <= last.end) {
      last.end = Math.max(last.end, region.end);
    } else {
      merged.push({ ...region });
    }
  }

  return merged;
}

/**
 * Picks cut points, one per window boundary, excluding 0 and `duration`.
 *
 * Walks the speech regions and closes a window when the *next* region would
 * push it past `target`, cutting in the middle of the silence between them. The
 * midpoint rather than either edge gives both windows a margin of quiet, so a
 * slightly-late VAD boundary on one side does not clip a word on the other.
 */
function chooseCuts(
  regions: SpeechRegion[],
  duration: number,
  options: ChunkPlanOptions
): number[] {
  const cuts: number[] = [];
  let windowStart = 0;

  for (let i = 0; i < regions.length; i += 1) {
    const region = regions[i]!;
    const next = regions[i + 1];

    // A single stretch of unbroken speech longer than the ceiling has no silence
    // to cut in. Split it at regular intervals and accept the bad boundaries —
    // the alternative is a window the model will truncate.
    if (region.end - windowStart > options.max) {
      let forced = windowStart + options.target;
      while (region.end - forced > options.max) {
        cuts.push(forced);
        windowStart = forced;
        forced += options.target;
      }
      if (forced < region.end) {
        cuts.push(forced);
        windowStart = forced;
      }
    }

    if (!next) break;

    // Closing here would land the boundary in the gap after `region`.
    const gapMid = (region.end + next.start) / 2;
    const wouldOverrun = next.end - windowStart > options.target;

    if (wouldOverrun && gapMid > windowStart) {
      cuts.push(gapMid);
      windowStart = gapMid;
    }
  }

  return cuts.filter((cut) => cut > 0 && cut < duration).sort((a, b) => a - b);
}

/** Fixed windows, used when there is no speech information to plan against. */
function fixedChunks(duration: number, options: ChunkPlanOptions): Chunk[] {
  const cuts: number[] = [];
  for (let at = options.target; at < duration; at += options.target) {
    cuts.push(at);
  }

  return toChunks(cuts, duration, options);
}

/** Materialises cut points into chunks, adding the context overlap. */
function toChunks(
  cuts: number[],
  duration: number,
  options: ChunkPlanOptions
): Chunk[] {
  const bounds = [0, ...cuts, duration];
  const chunks: Chunk[] = [];

  for (let i = 0; i < bounds.length - 1; i += 1) {
    const start = bounds[i]!;
    const end = bounds[i + 1]!;
    if (end <= start) continue;

    // The first chunk has nothing before it and the last nothing after, so they
    // get no overlap on those sides — clamping to the file avoids a window that
    // starts at a negative time.
    const overlapStart = Math.min(options.overlap, start);
    const overlapEnd = Math.min(options.overlap, duration - end);

    chunks.push({
      id: chunks.length,
      start,
      end,
      overlapStart,
      overlapEnd,
    });
  }

  return chunks;
}

/** The window actually handed to the model, context included. */
export function chunkWindow(chunk: Chunk): { start: number; end: number } {
  return {
    start: chunk.start - chunk.overlapStart,
    end: chunk.end + chunk.overlapEnd,
  };
}

/** Extracts one chunk's window from decoded samples, overlap included. */
export function sliceChunk(
  samples: Float32Array,
  chunk: Chunk,
  sampleRate: number
): Float32Array {
  const window = chunkWindow(chunk);
  const from = Math.max(0, Math.floor(window.start * sampleRate));
  const to = Math.min(samples.length, Math.ceil(window.end * sampleRate));

  // `slice` copies, which is required here: the result is transferred to a
  // worker, and transferring a view would detach the whole source buffer and
  // leave every later chunk empty.
  return samples.slice(from, to);
}
