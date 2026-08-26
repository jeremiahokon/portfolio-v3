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
  { text: "I'm Jeremiah, a " },
  { text: 'full-stack product engineer', accent: true },
  { text: ". For 4+ years I've shipped " },
  { text: 'React, Next.js and Node.js', accent: true },
  { text: ' products that clients actually profit from. I think in ' },
  { text: 'systems, and in revenue', accent: true },
  {
    text: ', owning every product I ship from first pixel to deployment. Bring me the problem you have been going in circles on, and ',
  },
  {
    text: "I'll find the solution your business can actually run on.",
    accent: true,
  },
];

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

// A segment boundary can fall mid-sentence, leaving punctuation stranded as its own word.
const words: Word[] = split.map((word, index) => ({
  ...word,
  space: !/^[.,;:!?)\]]/.test(split[index + 1]?.text ?? ''),
}));

// Min opacity for an unread word. This text is WCAG large-text (≥24px), so the
// bar is 3:1, not 4.5:1: ink 0.58 (3.1:1) and accent 0.72 (3.08:1, --sky-text
// has less contrast headroom). This is a resting floor, not a transient
// animation state: don't lower either value without rechecking contrast.
const FADE_FLOOR = { ink: 0.58, accent: 0.72 };

// Colour sweep, not just a fade: each word passes through a vivid peak hue
// before settling. PEAK/PEAK_ACCENT are brighter than the resting --sky-text
// (which must clear 4.5:1) but still meet the 3:1 large-text bar mid-sweep.
const INK = '#212727';
const PEAK = '#0f7ab8';
const ACCENT = '#2a5a76';
/** The accent words' own peak: they are already `--sky-text`, so theirs deepens. */
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
  // Each word's slice of scroll overlaps the next, so the front sweeps rather than snaps.
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
  // normal height, no pinning, no scrub.
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
