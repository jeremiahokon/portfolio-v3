import type { AsrSegment } from './types';

/**
 * Collapses degenerate decoder repetition.
 *
 * Whisper under greedy decoding can enter a repetition loop: it re-emits the same
 * token sequence until it exhausts the generation budget, and every repeat arrives
 * as its own timestamped segment. The 39-minute fixture contains two of them —
 * **86 consecutive "Thank you." segments inside 2.9 seconds of audio**, and 44
 * "Yeah, you can be..." inside 8 seconds. Together they produced 128 junk cues,
 * 17% of that file, and they are also where its 409 CPS maximum and most of its
 * unrenderable sub-0.4 s cues came from.
 *
 * This is deliberately a *deterministic* guard rather than only a generation
 * parameter, for three reasons. It is pure, so it is tested in Node against the
 * real artifact instead of by re-running a model. It cannot degrade a good
 * transcript, because it only fires on output that is physically impossible as
 * speech. And transformers.js 4.2.0 has no temperature fallback and no
 * compression-ratio check — the two mechanisms OpenAI's implementation uses to
 * detect and retry a failed decode — so nothing upstream of us will catch this.
 * A mild `repetition_penalty` in `asr.worker.ts` reduces how often the loop
 * happens; this bounds the damage when it happens anyway.
 */

/**
 * Characters per second beyond which a run cannot be speech.
 *
 * The readability ceiling for *reading* a subtitle is 20 CPS (section 2.4). This
 * is a different bound: the fastest rate a human can physically *articulate*.
 * Very fast speech reaches roughly 20 CPS, so 25 leaves clear headroom above
 * anything real while sitting far below the pathology — the 86-repeat run implies
 * 296 CPS, an order of magnitude out.
 *
 * Using an articulation-rate test rather than a repeat count is what makes this
 * safe. Someone genuinely saying "No. No. No." over 1.5 s implies about 20 CPS
 * and is left alone; the same three segments crammed into 0.1 s are not.
 */
export const MAX_ARTICULATION_CPS = 25;

/** Case- and punctuation-insensitive, so "Thank you." and "Thank you" are one run. */
function normalize(text: string): string {
  return text.toLowerCase().replaceAll(/[^\p{L}\p{N}]/gu, '');
}

/** Non-whitespace characters, matching how CPS is measured everywhere else. */
function density(text: string): number {
  return text.replaceAll(/\s/gu, '').length;
}

/**
 * Replaces each run of identical consecutive segments that implies an impossible
 * articulation rate with a single segment spanning the whole run.
 *
 * The surviving segment keeps the run's full time span rather than only the first
 * segment's, because the span is the one thing the loop got right: the speaker did
 * say something across that window. Keeping it also means the collapsed cue has a
 * sane duration — the 2.9 s "Thank you." becomes a readable 3.4 CPS cue instead of
 * a 34 ms one.
 *
 * Collapses to one copy, not two. When a decode has failed this way there is no
 * evidence left of how many repeats were genuine, and inventing a second copy
 * would be a guess. Dropping a real repeat is a trivial loss next to the run.
 */
export function collapseDegenerateRuns(segments: AsrSegment[]): AsrSegment[] {
  if (segments.length < 2) return segments;

  const out: AsrSegment[] = [];
  let collapsed = false;

  for (let i = 0; i < segments.length; ) {
    const first = segments[i]!;
    const key = normalize(first.text);

    // Extend to the end of the run of identical text.
    let end = i + 1;
    while (end < segments.length && normalize(segments[end]!.text) === key) {
      end += 1;
    }

    const length = end - i;

    if (length < 2 || key === '') {
      out.push(first);
      i += 1;
      continue;
    }

    const last = segments[end - 1]!;
    const span = last.end - first.start;
    const chars = density(first.text) * length;
    // A zero or negative span cannot be anything but degenerate, and guards the
    // division rather than letting it produce Infinity.
    const impossible = span <= 0 || chars / span > MAX_ARTICULATION_CPS;

    if (impossible) {
      out.push({ text: first.text, start: first.start, end: last.end });
      collapsed = true;
    } else {
      for (let j = i; j < end; j += 1) out.push(segments[j]!);
    }

    i = end;
  }

  return collapsed ? out : segments;
}

/**
 * How many segments `collapseDegenerateRuns` would remove.
 *
 * Reported to the user rather than silently discarded. A transcript that lost 128
 * of its segments to a failed decode is a transcript worth being told about — the
 * audio in those windows may genuinely not have been transcribed, since a loop
 * consumes the generation budget and truncates whatever real speech followed it.
 */
export function countDegenerateSegments(segments: AsrSegment[]): number {
  return segments.length - collapseDegenerateRuns(segments).length;
}
