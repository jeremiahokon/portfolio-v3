'use client';

import { useRef } from 'react';
import Image from 'next/image';

import type { MotionValue } from 'motion/react';
import { m, useScroll, useTransform } from 'motion/react';

import { useReducedMotion } from '@/lib/hooks';

interface Segment {
  text: string;
  accent?: boolean;
}

// ~55 words. Accented phrases render in the italic serif + blue, per the
// house headline pattern.
const segments: Segment[] = [
  { text: "I'm Jeremiah — a " },
  { text: 'full-stack product engineer', accent: true },
  { text: ". For 4+ years I've shipped " },
  { text: 'React, Next.js and Node.js', accent: true },
  { text: ' products that clients actually profit from. I think in ' },
  { text: 'systems — and in revenue', accent: true },
  {
    text: ' — owning every product I ship from first pixel to deployment. Bring me the problem you have been going in circles on, and ',
  },
  {
    text: "I'll find the solution your business can actually run on.",
    accent: true,
  },
];
// This paragraph has now shed two closers. The first, "I build in public and
// sharpen sales and marketing daily", was unfalsifiable. The second replaced it
// with the Dokita five-dashboard build — verifiable, but a case study, and the
// case studies are already two sections down. About is the only place on the page
// that answers *who is this*, so it ends on the offer instead: how I think, and
// what a client gets by bringing me a problem.

interface Word {
  text: string;
  accent: boolean;
  /** False before a word that opens with punctuation, so `engineer .` cannot happen. */
  space: boolean;
}

const split: Omit<Word, 'space'>[] = segments.flatMap((segment) =>
  segment.text
    .split(/\s+/)
    .filter(Boolean)
    .map((text) => ({ text, accent: Boolean(segment.accent) }))
);

// A segment boundary falls mid-sentence — ". For" starts the run after the first
// accent — so splitting on whitespace leaves punctuation stranded as its own word.
// It still animates on its own, it just loses the space in front of it.
const words: Word[] = split.map((word, index) => ({
  ...word,
  space: !/^[.,;:!?)\]]/.test(split[index + 1]?.text ?? ''),
}));

/**
 * Minimum opacity for an unread word.
 *
 * This was 0.75 because the paragraph was being held to 4.5:1. It should not have
 * been: this text is `clamp(1.6rem, 4vw, 3.25rem)`, so 25.6px at its *smallest*
 * viewport and heavier from there. That is WCAG large text (≥24px), whose AA
 * threshold is 3:1 — a limit the 4.5:1 number was leaving unspent for nothing.
 *
 * 0.58 is the measured point where `--ink` blended onto `--paper` still clears it
 * (3.1:1, against a 3:1 requirement). It roughly doubles the visible fade range, so
 * unread text now reads as clearly held back rather than as a rounding error.
 *
 * Do not push it lower without recomputing: 0.5 is 2.6:1 and fails, and unlike an
 * entrance animation this is a *resting* state — everything below the scroll
 * position genuinely sits at the floor until you reach it. The old 0.18 was 1.36:1,
 * unreadable, and 50 of the 68 accessibility failures once flagged on this page.
 *
 * The accent words get their own, higher floor. `--sky-text` starts closer to the
 * page than `--ink` does, so it runs out of room sooner: at 0.58 it is 2.40:1 and
 * fails, and 0.72 is where it clears (3.08:1). They still visibly dim — just less
 * far, which is the price of them being blue.
 */
const FADE_FLOOR = { ink: 0.58, accent: 0.72 };

/*
 * The sweep is a moving colour front, not just a fade.
 *
 * Lightness alone is a small effect even with the range above, so the second signal
 * is hue: each word passes through a vivid blue on its way to its resting colour,
 * which reads as a bright front travelling through the paragraph. The colour ramp
 * starts only once a word's opacity has finished, so nothing is ever dimmed and
 * tinted at once, and every stop is checked against the same 3:1 large-text bar:
 * `PEAK` is 3.9:1 on the page and `PEAK_ACCENT` is darker still.
 *
 * `PEAK` is deliberately more saturated than `--sky-text`. That token exists to be
 * a *resting* colour for body-sized links and italics, where it has to clear 4.5:1;
 * nothing rests here, so the front can be brighter than the brand's text blue while
 * still passing the bar that applies to it.
 */
const INK = '#212727';
const PEAK = '#0f7ab8';
const ACCENT = '#2a5a76';
/** The accent words' own peak — they are already `--sky-text`, so theirs deepens. */
const PEAK_ACCENT = '#0d557f';

/** Word-widths of scroll each word owns; the front is ~2 words wide within it. */
const WINDOW = 4;

function ManifestoWord({
  word,
  index,
  total,
  progress,
}: {
  word: Word;
  index: number;
  total: number;
  progress: MotionValue<number>;
}) {
  // Each word owns its own slice of the scroll, and the slices overlap, so the
  // front sweeps through the paragraph rather than snapping word by word. See
  // FADE_FLOOR and the colour constants above for what the sweep is made of.
  const span = index / (total + WINDOW);
  const unit = 1 / (total + WINDOW);
  const at = (offset: number) => span + offset * unit;

  const opacity = useTransform(
    progress,
    [at(0), at(1.6)],
    [word.accent ? FADE_FLOOR.accent : FADE_FLOOR.ink, 1]
  );
  const color = useTransform(
    progress,
    [at(1.4), at(2.4), at(WINDOW)],
    word.accent ? [ACCENT, PEAK_ACCENT, ACCENT] : [INK, PEAK, INK]
  );

  return (
    <m.span
      style={{ opacity, color }}
      className={
        word.accent
          ? 'font-family-instrument text-sky-text font-normal italic'
          : undefined
      }
    >
      {word.text}
      {word.space ? ' ' : ''}
    </m.span>
  );
}

export default function Manifesto() {
  const sectionRef = useRef<HTMLElement>(null);
  const prefersReducedMotion = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start start', 'end end'],
  });

  const footerOpacity = useTransform(scrollYProgress, [0.75, 0.95], [0, 1]);

  const paragraphClass =
    'text-ink max-w-4xl text-left text-[clamp(1.6rem,4vw,3.25rem)] leading-[1.3] font-medium tracking-tight';

  const groundingRow = (
    <div className="font-family-inter text-ink/80 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
      <Image
        src="/assets/profile.jpg"
        alt="Jeremiah Okon"
        width={40}
        height={40}
        className="h-10 w-10 rounded-sm object-cover"
      />
      <span>Jeremiah Okon</span>
      <span aria-hidden="true" className="text-ink/30">
        ·
      </span>
      <span>Nigeria (GMT+1)</span>
      <span aria-hidden="true" className="text-ink/30">
        ·
      </span>
      <span>replies within hours</span>
      <span aria-hidden="true" className="text-ink/30">
        ·
      </span>
      <span>currently learning Go</span>
    </div>
  );

  // Reduced motion (or no JS once hydrated): plain, fully visible text at
  // normal height — no pinning, no scrub.
  if (prefersReducedMotion) {
    return (
      <section
        id="about"
        className="relative w-full px-4 py-20 md:px-10 md:py-32"
      >
        <div className="mx-auto flex max-w-4xl flex-col gap-10">
          <span className="font-family-inter text-ink/85 text-xs font-medium tracking-[0.3em] uppercase">
            [ ABOUT ]
          </span>
          <p className={paragraphClass}>
            {segments.map((segment, index) => (
              <span
                key={index}
                className={
                  segment.accent
                    ? 'font-family-instrument text-sky-text font-normal italic'
                    : undefined
                }
              >
                {segment.text}
              </span>
            ))}
          </p>
          {groundingRow}
        </div>
      </section>
    );
  }

  return (
    <section ref={sectionRef} id="about" className="relative h-[220vh] w-full">
      <div className="sticky top-0 flex h-screen w-full items-center px-4 md:px-10">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-10">
          <span className="font-family-inter text-ink/85 text-xs font-medium tracking-[0.3em] uppercase">
            [ ABOUT ]
          </span>
          <p className={paragraphClass}>
            {words.map((word, index) => (
              <ManifestoWord
                key={index}
                word={word}
                index={index}
                total={words.length}
                progress={scrollYProgress}
              />
            ))}
          </p>
          <m.div style={{ opacity: footerOpacity }}>{groundingRow}</m.div>
        </div>
      </div>
    </section>
  );
}
