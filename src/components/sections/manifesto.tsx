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
  { text: 'frontend engineer gone full-stack', accent: true },
  { text: ". For 4+ years I've shipped " },
  { text: 'React and Next.js', accent: true },
  { text: ' products that clients actually profit from. I think in ' },
  { text: 'systems — and in revenue', accent: true },
  {
    text: ' — owning every detail from first pixel to deployment. I build in public and sharpen sales and marketing daily, ',
  },
  { text: "so you know exactly who you're hiring.", accent: true },
];

interface Word {
  text: string;
  accent: boolean;
}

const words: Word[] = segments.flatMap((segment) =>
  segment.text
    .split(/\s+/)
    .filter(Boolean)
    .map((text) => ({ text, accent: Boolean(segment.accent) }))
);

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
  // Each word brightens over its own slice of the scroll, three words wide,
  // so the reveal sweeps through the paragraph as you scroll.
  const start = index / (total + 3);
  const end = (index + 3) / (total + 3);
  const opacity = useTransform(progress, [start, end], [0.18, 1]);

  return (
    <m.span
      style={{ opacity }}
      className={
        word.accent
          ? 'font-family-instrument text-sky-deep font-normal italic'
          : undefined
      }
    >
      {word.text}{' '}
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
    <div className="font-family-inter text-ink/60 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
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
          <span className="font-family-inter text-ink/50 text-xs font-medium tracking-[0.3em] uppercase">
            [ ABOUT ]
          </span>
          <p className={paragraphClass}>
            {segments.map((segment, index) => (
              <span
                key={index}
                className={
                  segment.accent
                    ? 'font-family-instrument text-sky-deep font-normal italic'
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
          <span className="font-family-inter text-ink/50 text-xs font-medium tracking-[0.3em] uppercase">
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
