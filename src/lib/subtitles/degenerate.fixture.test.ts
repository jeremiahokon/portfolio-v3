import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  buildCues,
  normalizeCues,
  resetIds,
  wordsFromSegments,
} from './cues';
import { collapseDegenerateRuns } from './degenerate';
import type { AsrSegment, Word } from './types';

/**
 * Replays the real 39-minute Zoom artifact through the degenerate-run guard.
 *
 * This is the M2.5 acceptance evidence, and it needs no browser, no model and no
 * audio — the pathology is visible in the SRT the user already has, so the fix is
 * provable in Node against the exact output that motivated it.
 *
 * **Skipped when the fixture is absent, and it is absent from git on purpose.**
 * The recording is a private client call, `docs/` is gitignored, and publishing a
 * business conversation into a public portfolio repository to gain a test fixture
 * would be an indefensible trade. Regenerate by re-running the file locally.
 */
const FIXTURE = 'docs/fixtures/zoom-39min-baseline.srt';
const present = existsSync(FIXTURE);

function baselineSegments(): AsrSegment[] {
  const seconds = (stamp: string): number => {
    const [h, m, rest] = stamp.split(':');
    const [s, ms] = rest!.split(',');

    return +h! * 3600 + +m! * 60 + +s! + +ms! / 1000;
  };

  return readFileSync(FIXTURE, 'utf8')
    .trim()
    .split(/\r?\n\r?\n/)
    .map((block) => {
      const lines = block.split(/\r?\n/);
      const [from, to] = lines[1]!.split(' --> ');

      return {
        text: lines.slice(2).join(' '),
        start: seconds(from!),
        end: seconds(to!),
      };
    });
}

/** Longest run of identical consecutive segments. */
function longestRun(segments: AsrSegment[]): number {
  const key = (s: AsrSegment) => s.text.toLowerCase().replaceAll(/[^a-z0-9]/g, '');
  let worst = 1;
  let current = 1;

  for (let i = 1; i < segments.length; i += 1) {
    if (key(segments[i]!) === key(segments[i - 1]!)) {
      current += 1;
      worst = Math.max(worst, current);
    } else current = 1;
  }

  return worst;
}

function rebuild(segments: AsrSegment[]) {
  resetIds();
  const words = wordsFromSegments(segments);

  return { words, cues: normalizeCues(words, buildCues(words)) };
}

function unrenderable(words: Word[], cues: ReturnType<typeof rebuild>['cues']) {
  return cues.filter((cue) => {
    const start = cue.overrideStart ?? words[cue.wordStart]!.start;
    const end = cue.overrideEnd ?? words[cue.wordEnd]!.end;

    return end - start < 0.4;
  }).length;
}

describe.skipIf(!present)('the 39-minute fixture, replayed', () => {
  it('collapses exactly the 128 measured junk segments', () => {
    const before = baselineSegments();
    const after = collapseDegenerateRuns(before);

    // 86 "Thank you." + 44 "Yeah, you can be..." become one segment each.
    expect(before.length - after.length).toBe(128);
  });

  it('eliminates the 86-repeat run', () => {
    expect(longestRun(baselineSegments())).toBe(86);
    expect(longestRun(collapseDegenerateRuns(baselineSegments()))).toBeLessThanOrEqual(2);
  });

  it('removes four fifths of the unrenderable cues', () => {
    const before = rebuild(baselineSegments());
    const after = rebuild(collapseDegenerateRuns(baselineSegments()));

    const wasBad = unrenderable(before.words, before.cues);
    const isBad = unrenderable(after.words, after.cues);

    expect(wasBad).toBeGreaterThan(150);
    expect(isBad).toBeLessThan(wasBad * 0.25);
  });

  it('leaves the transcript’s real content intact', () => {
    const before = rebuild(baselineSegments());
    const after = rebuild(collapseDegenerateRuns(baselineSegments()));

    // Cue count falls because junk is gone, never because speech was lost: the
    // words removed are all repeats of text that still appears.
    expect(after.cues.length).toBeLessThan(before.cues.length);

    const vocabulary = (words: Word[]) =>
      new Set(words.map((w) => w.text.toLowerCase().replaceAll(/[^a-z0-9]/g, '')));
    const lost = [...vocabulary(before.words)].filter(
      (w) => w !== '' && !vocabulary(after.words).has(w)
    );

    expect(lost).toEqual([]);
  });
});
