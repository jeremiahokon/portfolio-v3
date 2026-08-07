import type { AsrSegment, Chunk } from './types';

/**
 * Reassembles per-chunk ASR output into one transcript.
 *
 * Pure. Three jobs, in order:
 *
 * 1. **Drop overlap duplicates.** Each window carries a second of its
 *    neighbours' audio for context, so the words in that second get transcribed
 *    twice. The chunk that *owns* the time keeps them.
 * 2. **Enforce monotonicity.** Whisper occasionally emits a segment whose start
 *    precedes the previous segment's end, and a subtitle track that goes
 *    backwards is invalid rather than merely untidy.
 * 3. **Normalise pauses.** A segment ending exactly where the next begins reads
 *    as one run-on cue; a small enforced gap keeps them distinct.
 */

export interface StitchOptions {
  /**
   * Seconds. Segments closer together than this are separated rather than left
   * touching. Two frames at 24fps is the broadcast convention.
   */
  minGap: number;
  /**
   * Most words to consider when trimming a duplicated run at a chunk seam.
   *
   * Bounded so a genuinely repetitive passage ("very, very, very tired") cannot
   * be mistaken for seam duplication and collapsed. One second of overlap holds
   * roughly three words of speech, so this leaves generous headroom.
   */
  maxSeamWords: number;
}

export const DEFAULT_STITCH: StitchOptions = {
  minGap: 0.083,
  maxSeamWords: 12,
};

export interface ChunkResult {
  chunk: Chunk;
  segments: AsrSegment[];
}

/**
 * Merges chunk results into a single ordered segment list.
 *
 * Segments are assigned to a chunk by their **midpoint**, not their start. A
 * segment straddling a boundary would otherwise be claimed by whichever chunk
 * saw its first instant, which is the chunk that only had it as context — so the
 * copy transcribed with the *least* surrounding audio would win.
 */
export function stitch(
  results: ChunkResult[],
  options: StitchOptions = DEFAULT_STITCH
): AsrSegment[] {
  const owned: Array<AsrSegment & { chunkId: number }> = [];

  for (const { chunk, segments } of results) {
    for (const segment of segments) {
      const midpoint = (segment.start + segment.end) / 2;
      // Half-open interval: a segment landing exactly on a boundary belongs to
      // the later chunk, so neither chunk drops it and neither keeps it twice.
      const isLast = chunk.overlapEnd === 0;
      const withinStart = midpoint >= chunk.start;
      const withinEnd = isLast ? midpoint <= chunk.end : midpoint < chunk.end;

      if (withinStart && withinEnd)
        owned.push({ ...segment, chunkId: chunk.id });
    }
  }

  owned.sort((a, b) => a.start - b.start || a.end - b.end);

  return enforceMonotonic(trimSeamDuplicates(owned, options), options);
}

/** Comparable form of a word: case- and punctuation-insensitive. */
function normalizeWord(word: string): string {
  return word.toLowerCase().replaceAll(/[^\p{L}\p{N}]/gu, '');
}

/**
 * Removes words duplicated across a chunk seam.
 *
 * Midpoint ownership deduplicates whole *segments*, which is not enough:
 * Whisper's segments are multi-second and routinely straddle a boundary, so the
 * same words can appear inside two segments that each legitimately belong to a
 * different chunk. Observed in a real transcript as
 * `"…the change was" / "permanent." / "was permanent, anyone with a computer…"`
 * — "was permanent" transcribed once as chunk N's trailing context and again as
 * chunk N+1's opening content.
 *
 * The later segment's leading duplicate is the one trimmed. Its copy sits in
 * that chunk's leading overlap, meaning the model saw little audio *before* it,
 * whereas the earlier chunk transcribed the same words with full preceding
 * context — so the earlier copy is the better-informed one.
 *
 * Only compares across a chunk change, never within one chunk, so real
 * repetition inside a single window is left alone.
 */
export function trimSeamDuplicates(
  segments: Array<AsrSegment & { chunkId: number }>,
  options: StitchOptions = DEFAULT_STITCH
): AsrSegment[] {
  const out: Array<AsrSegment & { chunkId: number }> = [];

  for (const segment of segments) {
    const previous = out.at(-1);

    if (!previous || previous.chunkId === segment.chunkId) {
      out.push({ ...segment });
      continue;
    }

    const before = previous.text.split(/\s+/).filter(Boolean);
    const after = segment.text.split(/\s+/).filter(Boolean);
    const limit = Math.min(options.maxSeamWords, before.length, after.length);

    // Longest run first: trimming the longest duplicate avoids leaving a
    // fragment behind when several run lengths happen to match.
    let overlap = 0;
    for (let k = limit; k >= 1; k -= 1) {
      const tail = before.slice(before.length - k).map(normalizeWord);
      const head = after.slice(0, k).map(normalizeWord);
      if (tail.every((word, i) => word === head[i])) {
        overlap = k;
        break;
      }
    }

    if (overlap === 0) {
      out.push({ ...segment });
      continue;
    }

    const kept = after.slice(overlap);
    // Nothing left: the whole segment was duplicate, so drop it rather than
    // emitting an empty cue.
    if (kept.length === 0) continue;

    // Advance the start proportionally to the words removed, so the shortened
    // text is not left claiming time that belonged to the trimmed words.
    const removedFraction = overlap / after.length;
    const span = segment.end - segment.start;

    out.push({
      ...segment,
      text: kept.join(' '),
      start: segment.start + span * removedFraction,
    });
  }

  return out.map(({ chunkId: _chunkId, ...segment }) => segment);
}

/**
 * Makes a segment list strictly forward-moving.
 *
 * Pushes a segment's start past the previous end when they collide, and only
 * then pushes its end out if that inverted the segment. Timings are never pulled
 * *earlier*, because an earlier start would re-collide with the segment before.
 */
export function enforceMonotonic(
  segments: AsrSegment[],
  options: StitchOptions = DEFAULT_STITCH
): AsrSegment[] {
  const out: AsrSegment[] = [];

  for (const segment of segments) {
    const previous = out.at(-1);
    let { start, end } = segment;

    if (previous) {
      const earliest = previous.end + options.minGap;
      if (start < earliest) start = earliest;
    }
    if (end < start) end = start;

    // A segment squeezed to zero length carries no timing information, but its
    // text still matters — keep it rather than dropping words from the
    // transcript, and let cue normalisation give it a duration.
    out.push({ ...segment, start, end });
  }

  return out;
}
