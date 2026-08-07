import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import reference from './__fixtures__/reference-synthetic.json';
import {
  formatReport,
  isHardWord,
  passesGate,
  scoreWords,
  type TimedWord,
} from './score';

/**
 * The M2 acceptance gate, measured.
 *
 * Word-boundary precision and recall at a 200 ms collar against a reference clip
 * whose truth is known by construction — see `scripts/make-reference-clip.mjs` for
 * how, and for the honest limits of using synthesised speech.
 *
 * The hypothesis is the tool's own word-level JSON export, produced by running the
 * reference clip through the real pipeline in a browser with the aligner enabled.
 * That is deliberate: scoring the aligner in isolation would miss everything between
 * it and the file a user downloads — chunk planning, stitching, the score threshold,
 * `applyAlignment`, `enforceWordOrder`. This measures what actually ships.
 *
 * Skipped when the export is absent, because producing it needs a browser, a GPU and
 * a ~330 MB model download. Regenerate by dropping
 * `docs/fixtures/reference-synthetic.wav` into `/video-to-subtitles`, clicking
 * "Improve timing accuracy", exporting JSON, and saving it to the path below.
 */
const HYPOTHESIS = 'docs/fixtures/reference-hypothesis.json';
const present = existsSync(HYPOTHESIS);

/** The plan's threshold: precision AND recall, never their average. */
const THRESHOLD = 0.9;
const COLLAR = 0.2;

function hypothesisWords(): TimedWord[] {
  const raw: unknown = JSON.parse(readFileSync(HYPOTHESIS, 'utf8'));
  // The JSON export is `{ words: [...] }` with extra fields per word; keep only
  // what a score needs so a change to the export shape fails loudly here.
  const words = (raw as { words?: Array<{ text: string; start: number; end: number }> })
    .words;
  if (!Array.isArray(words)) {
    throw new Error(`${HYPOTHESIS} has no "words" array — is it the JSON export?`);
  }

  return words.map((w) => ({ text: w.text, start: w.start, end: w.end }));
}

describe('the reference clip itself', () => {
  it('has ground truth that is internally consistent', () => {
    const words = reference.words as TimedWord[];

    expect(words.length).toBeGreaterThan(40);
    for (const [i, word] of words.entries()) {
      expect(word.end).toBeGreaterThan(word.start);
      if (i > 0) {
        // Built with fixed silences, so words never overlap and always advance.
        expect(word.start).toBeGreaterThanOrEqual(words[i - 1]!.end);
      }
    }
    expect(words.at(-1)!.end).toBeLessThanOrEqual(reference.duration);
  });

  it('includes the hard cases R5 predicted the aligner would fail', () => {
    const hard = (reference.words as TimedWord[]).filter(isHardWord);

    // Digits and acronyms, scored separately rather than averaged into the total.
    expect(hard.length).toBeGreaterThanOrEqual(5);
    expect(hard.map((w) => w.text)).toContain('2026');
  });
});

describe.skipIf(!present)('M2 gate — measured against the reference', () => {
  it('reports the numbers', () => {
    const ref = reference.words as TimedWord[];
    const hyp = hypothesisWords();

    const all = scoreWords(ref, hyp, { collar: COLLAR });
    const easy = scoreWords(ref, hyp, {
      collar: COLLAR,
      filter: (w) => !isHardWord(w),
    });
    const hard = scoreWords(ref, hyp, {
      collar: COLLAR,
      filter: isHardWord,
    });

    // Printed unconditionally: the milestone's job is to report a number, and a
    // number nobody can see is not a gate.
    console.warn(
      formatReport(
        [
          { label: 'ordinary words', overall: easy, hard },
          { label: 'all words', overall: all },
        ],
        THRESHOLD
      )
    );

    // The clip is synthetic and cleanly separated, so pairing should be near total.
    // If this fails, the transcript diverged from the reference and the boundary
    // numbers below are measuring the wrong thing.
    expect(all.pairedWords).toBeGreaterThan(ref.length * 0.6);

    // The plan's target is 0.90 precision AND recall. **It is not met yet** —
    // 0.604 as measured, up from 0.375 before the word-delimiter fix. Asserting the
    // target here would leave a permanently red suite, which teaches everyone to
    // ignore it; asserting nothing would let the number rot silently. So this is a
    // ratchet: it fails if the score drops below what is currently achieved, and the
    // distance to the real gate is recorded rather than hidden.
    //
    // What remains is *not* boundary precision. Matched boundaries average 60 ms of
    // error, comfortably inside the collar. The failures are whole words shifted by a
    // constant — some ten-second bands score near-perfectly (−0.03 s mean) while
    // others sit at +1.0 s or +3.0 s — which points at a per-window offset or a chunk
    // seam, not at the trellis.
    const RATCHET = 0.6;
    expect(easy.precision).toBeGreaterThanOrEqual(RATCHET);
    expect(easy.recall).toBeGreaterThanOrEqual(RATCHET);
    expect(passesGate(easy, THRESHOLD)).toBe(false);

    // Boundaries that *do* match must stay tight — this is the part that works, and
    // it is the part a regression in the trellis would break first.
    expect(easy.meanAbsoluteError).toBeLessThan(0.1);
    expect(easy.maxAbsoluteError).toBeLessThanOrEqual(COLLAR);
  });
});
