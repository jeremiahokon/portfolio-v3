import { describe, expect, it } from 'vitest';

import {
  chunkWindow,
  DEFAULT_CHUNK_PLAN as P,
  mergeRegions,
  planChunks,
  sliceChunk,
} from './chunk-plan';
import { enforceMonotonic, stitch, trimSeamDuplicates } from './stitch';
import type { AsrSegment, Chunk, SpeechRegion } from './types';

function region(start: number, end: number): SpeechRegion {
  return { start, end };
}

/** Speech in `speechLength` bursts separated by `gap` seconds of silence. */
function burstyRegions(
  count: number,
  speechLength: number,
  gap: number
): SpeechRegion[] {
  return Array.from({ length: count }, (_, i) => {
    const start = i * (speechLength + gap);

    return region(start, start + speechLength);
  });
}

describe('mergeRegions', () => {
  it('merges overlapping regions', () => {
    expect(mergeRegions([region(0, 5), region(3, 8)])).toEqual([region(0, 8)]);
  });

  it('merges touching regions', () => {
    expect(mergeRegions([region(0, 5), region(5, 9)])).toEqual([region(0, 9)]);
  });

  it('keeps separated regions apart', () => {
    expect(mergeRegions([region(0, 5), region(6, 9)])).toEqual([
      region(0, 5),
      region(6, 9),
    ]);
  });

  it('sorts unordered input', () => {
    expect(mergeRegions([region(10, 12), region(0, 2)])).toEqual([
      region(0, 2),
      region(10, 12),
    ]);
  });

  it('drops empty and inverted regions', () => {
    expect(mergeRegions([region(3, 3), region(9, 4)])).toEqual([]);
  });
});

describe('planChunks', () => {
  it('returns nothing for empty audio', () => {
    expect(planChunks([], 0)).toEqual([]);
  });

  it('keeps short audio as a single chunk', () => {
    const chunks = planChunks([region(0.5, 9)], 10);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ start: 0, end: 10 });
  });

  it('falls back to fixed windows when the VAD found no speech', () => {
    // Returning an empty plan here would silently transcribe none of the file.
    const chunks = planChunks([], 90);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]!.start).toBe(0);
    expect(chunks.at(-1)!.end).toBe(90);
  });

  it('covers the whole file with no gaps and no overlaps in ownership', () => {
    const chunks = planChunks(burstyRegions(20, 4, 1), 100);

    expect(chunks[0]!.start).toBe(0);
    expect(chunks.at(-1)!.end).toBe(100);
    for (let i = 1; i < chunks.length; i += 1) {
      expect(chunks[i]!.start).toBe(chunks[i - 1]!.end);
    }
  });

  it('places every internal boundary inside a silence gap', () => {
    const regions = burstyRegions(20, 4, 1);
    const chunks = planChunks(regions, 100);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks.slice(1)) {
      const insideSpeech = regions.some(
        (r) => chunk.start > r.start && chunk.start < r.end
      );
      expect(insideSpeech).toBe(false);
    }
  });

  it('never exceeds the hard ceiling, even through unbroken speech', () => {
    // One continuous 120 s utterance: there is no silence to cut in, so the
    // planner must force cuts rather than emit a window the model truncates.
    const chunks = planChunks([region(0, 120)], 120);

    for (const chunk of chunks) {
      expect(chunk.end - chunk.start).toBeLessThanOrEqual(P.max);
    }
    expect(chunks.at(-1)!.end).toBe(120);
  });

  it('keeps the model window within the ceiling once overlap is added', () => {
    const chunks = planChunks(burstyRegions(30, 3, 1), 120);

    for (const chunk of chunks) {
      const window = chunkWindow(chunk);
      expect(window.end - window.start).toBeLessThanOrEqual(
        P.max + 2 * P.overlap
      );
    }
  });

  it('gives the first and last chunk no outward overlap', () => {
    const chunks = planChunks(burstyRegions(20, 4, 1), 100);

    expect(chunks[0]!.overlapStart).toBe(0);
    expect(chunks.at(-1)!.overlapEnd).toBe(0);
  });

  it('numbers chunks consecutively from zero', () => {
    const chunks = planChunks(burstyRegions(20, 4, 1), 100);

    expect(chunks.map((c) => c.id)).toEqual(chunks.map((_, i) => i));
  });
});

describe('sliceChunk', () => {
  const sampleRate = 100;
  const samples = new Float32Array(
    Array.from({ length: 1000 }, (_, i) => i / 1000)
  );

  it('includes the overlap on both sides', () => {
    const chunk: Chunk = {
      id: 1,
      start: 3,
      end: 6,
      overlapStart: 1,
      overlapEnd: 1,
    };

    // 2 s .. 7 s at 100 Hz = 500 samples.
    expect(sliceChunk(samples, chunk, sampleRate)).toHaveLength(500);
  });

  it('clamps to the available samples', () => {
    const chunk: Chunk = {
      id: 0,
      start: 0,
      end: 10,
      overlapStart: 0,
      overlapEnd: 0,
    };

    expect(sliceChunk(samples, chunk, sampleRate)).toHaveLength(1000);
  });

  it('copies rather than viewing, so transferring one chunk cannot empty the rest', () => {
    const chunk: Chunk = {
      id: 0,
      start: 0,
      end: 2,
      overlapStart: 0,
      overlapEnd: 0,
    };
    const slice = sliceChunk(samples, chunk, sampleRate);

    expect(slice.buffer).not.toBe(samples.buffer);
  });
});

describe('stitch', () => {
  function chunk(
    id: number,
    start: number,
    end: number,
    overlapStart: number,
    overlapEnd: number
  ): Chunk {
    return { id, start, end, overlapStart, overlapEnd };
  }

  function segment(text: string, start: number, end: number): AsrSegment {
    return { text, start, end };
  }

  it('drops words the neighbouring chunk already owns', () => {
    const results = [
      {
        chunk: chunk(0, 0, 10, 0, 1),
        // "overlap" sits at 10.5, inside chunk 1's territory.
        segments: [segment('first', 1, 3), segment('overlap', 10.2, 10.8)],
      },
      {
        chunk: chunk(1, 10, 20, 1, 0),
        segments: [segment('overlap', 10.2, 10.8), segment('second', 12, 14)],
      },
    ];

    expect(stitch(results).map((s) => s.text)).toEqual([
      'first',
      'overlap',
      'second',
    ]);
  });

  it('assigns a straddling segment by midpoint, not by start', () => {
    // Starts in chunk 0's context but is mostly chunk 1's; chunk 1 saw more of
    // its audio, so chunk 1's transcription is the one to trust.
    const results = [
      {
        chunk: chunk(0, 0, 10, 0, 1),
        segments: [segment('from-chunk-0', 9.6, 10.9)],
      },
      {
        chunk: chunk(1, 10, 20, 1, 0),
        segments: [segment('from-chunk-1', 9.6, 10.9)],
      },
    ];

    expect(stitch(results).map((s) => s.text)).toEqual(['from-chunk-1']);
  });

  it('keeps a segment landing exactly on a boundary exactly once', () => {
    const results = [
      { chunk: chunk(0, 0, 10, 0, 1), segments: [segment('edge', 9.5, 10.5)] },
      { chunk: chunk(1, 10, 20, 1, 0), segments: [segment('edge', 9.5, 10.5)] },
    ];

    expect(stitch(results).filter((s) => s.text === 'edge')).toHaveLength(1);
  });

  it('orders the result by time regardless of chunk arrival order', () => {
    const results = [
      { chunk: chunk(1, 10, 20, 1, 0), segments: [segment('later', 12, 14)] },
      { chunk: chunk(0, 0, 10, 0, 1), segments: [segment('earlier', 1, 3)] },
    ];

    expect(stitch(results).map((s) => s.text)).toEqual(['earlier', 'later']);
  });

  it('loses no words from a full multi-chunk plan', () => {
    const chunks = planChunks(burstyRegions(20, 4, 1), 100);
    const results = chunks.map((c) => ({
      chunk: c,
      // Each chunk reports one segment per second of its window, overlap
      // included — so the overlap seconds genuinely appear twice.
      segments: Array.from(
        { length: Math.round(chunkWindow(c).end - chunkWindow(c).start) },
        (_, i) => {
          const at = chunkWindow(c).start + i;

          return segment(`t${at}`, at, at + 1);
        }
      ),
    }));

    const stitched = stitch(results);
    const texts = stitched.map((s) => s.text);

    expect(new Set(texts).size).toBe(texts.length);
  });
});

describe('trimSeamDuplicates', () => {
  const tagged = (
    chunkId: number,
    text: string,
    start: number,
    end: number
  ) => ({ chunkId, text, start, end });

  it('removes the exact duplication seen in a real transcript', () => {
    // Midpoint ownership kept both of these: one is chunk 0's trailing context,
    // the other chunk 1's opening content, and they share "was permanent".
    const trimmed = trimSeamDuplicates([
      tagged(0, 'and this time the change was permanent.', 22, 27.4),
      tagged(
        1,
        'was permanent, anyone with a computer could now typeset a book.',
        27.4,
        33
      ),
    ]);

    expect(trimmed[1]!.text).toBe(
      'anyone with a computer could now typeset a book.'
    );
  });

  it('trims a single repeated word at a seam', () => {
    const trimmed = trimSeamDuplicates([
      tagged(0, 'everything accelerated dramatically.', 10, 17),
      tagged(1, 'dramatically, suddenly a single operator', 17, 22),
    ]);

    expect(trimmed[1]!.text).toBe('suddenly a single operator');
  });

  it('ignores punctuation and case when matching', () => {
    const trimmed = trimSeamDuplicates([
      tagged(0, 'the change was Permanent!', 0, 10),
      tagged(1, 'permanent, anyone', 10, 15),
    ]);

    expect(trimmed[1]!.text).toBe('anyone');
  });

  it('leaves real repetition inside one chunk alone', () => {
    // Same chunk id, so this is speech, not a seam artefact.
    const segments = [
      tagged(0, 'I was very very tired', 0, 5),
      tagged(0, 'very tired indeed', 5, 9),
    ];

    expect(trimSeamDuplicates(segments).map((s) => s.text)).toEqual([
      'I was very very tired',
      'very tired indeed',
    ]);
  });

  it('leaves distinct text across a seam untouched', () => {
    const segments = [
      tagged(0, 'first chunk content', 0, 10),
      tagged(1, 'entirely different words', 10, 20),
    ];

    expect(trimSeamDuplicates(segments).map((s) => s.text)).toEqual([
      'first chunk content',
      'entirely different words',
    ]);
  });

  it('drops a segment that was duplicate all the way through', () => {
    const trimmed = trimSeamDuplicates([
      tagged(0, 'the change was permanent', 0, 10),
      tagged(1, 'was permanent', 10, 12),
    ]);

    expect(trimmed).toHaveLength(1);
  });

  it('advances the start of a trimmed segment so it does not claim removed time', () => {
    const trimmed = trimSeamDuplicates([
      tagged(0, 'one two', 0, 10),
      tagged(1, 'two three four five', 10, 20),
    ]);

    expect(trimmed[1]!.start).toBeGreaterThan(10);
    expect(trimmed[1]!.text).toBe('three four five');
  });

  it('never trims more than maxSeamWords', () => {
    const long = Array.from({ length: 30 }, (_, i) => `w${i}`).join(' ');
    const trimmed = trimSeamDuplicates(
      [tagged(0, long, 0, 10), tagged(1, long, 10, 20)],
      { minGap: 0.083, maxSeamWords: 3 }
    );

    // Only a 3-word run may be considered, and this text does not end with the
    // same 3 words it starts with, so nothing is removed.
    expect(trimmed[1]!.text).toBe(long);
  });

  it('strips the internal chunk tag from its output', () => {
    const trimmed = trimSeamDuplicates([tagged(0, 'hello', 0, 1)]);

    expect(trimmed[0]).not.toHaveProperty('chunkId');
  });
});

describe('enforceMonotonic', () => {
  it('pushes a backwards segment forward', () => {
    const fixed = enforceMonotonic([
      { text: 'a', start: 0, end: 5 },
      { text: 'b', start: 3, end: 8 },
    ]);

    expect(fixed[1]!.start).toBeGreaterThanOrEqual(fixed[0]!.end);
  });

  it('never leaves an inverted segment', () => {
    const fixed = enforceMonotonic([
      { text: 'a', start: 0, end: 10 },
      { text: 'b', start: 1, end: 2 },
    ]);

    expect(fixed[1]!.end).toBeGreaterThanOrEqual(fixed[1]!.start);
  });

  it('keeps text even when a segment is squeezed to nothing', () => {
    const fixed = enforceMonotonic([
      { text: 'a', start: 0, end: 10 },
      { text: 'b', start: 1, end: 2 },
    ]);

    expect(fixed.map((s) => s.text)).toEqual(['a', 'b']);
  });

  it('leaves already-ordered segments alone', () => {
    const input: AsrSegment[] = [
      { text: 'a', start: 0, end: 1 },
      { text: 'b', start: 2, end: 3 },
    ];

    expect(enforceMonotonic(input)).toEqual(input);
  });
});
