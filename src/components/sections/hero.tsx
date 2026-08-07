'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { sendGAEvent } from '@next/third-parties/google';

import { Calendar } from 'lucide-react';
import {
  m,
  useMotionValue,
  useScroll,
  useSpring,
  useTransform,
} from 'motion/react';

import { CalendlyModal } from '@/components/calendly-modal';

import { GA_EVENTS } from '@/lib/analytics-events';
import { BOOK_A_CALL, UPWORK_PROFILE_URL } from '@/lib/constant';
import { useReducedMotion } from '@/lib/hooks';

function UpworkIcon({ className }: { className?: string }) {
  return (
    <svg
      role="img"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="currentColor"
      className={className}
    >
      <path d="M18.561 13.158c-1.102 0-2.135-.467-3.074-1.227l.228-1.076.008-.042c.207-1.143.849-3.06 2.839-3.06a2.705 2.705 0 0 1 2.703 2.703 2.707 2.707 0 0 1-2.704 2.702zm0-8.14c-2.539 0-4.51 1.649-5.31 4.366-1.22-1.834-2.148-4.036-2.687-5.892H7.828v7.112a2.551 2.551 0 0 1-2.547 2.548 2.55 2.55 0 0 1-2.545-2.548V3.492H0v7.112c0 3 2.443 5.489 5.443 5.489a5.505 5.505 0 0 0 5.446-5.489v-1.19c.529 1.107 1.182 2.229 1.974 3.221l-1.673 7.873h2.797l1.213-5.71c1.063.679 2.285 1.109 3.686 1.109 3 0 5.439-2.452 5.439-5.45 0-3-2.439-5.45-5.439-5.45z" />
    </svg>
  );
}

// Overlapping collage — each card gets its own place, tilt, and depth plane
// instead of a uniform cascade.
const proofShots = [
  {
    src: '/assets/webp/torrista-v2.webp',
    alt: 'Torrista — travel platform',
    className: 'top-0 left-0 w-[64%]',
    rotate: -4,
    z: -140,
    depth: 1,
  },
  {
    src: '/assets/webp/dripa.webp',
    alt: 'DriPA — driver performance platform',
    className: 'top-[4%] right-0 w-[60%]',
    rotate: 3,
    z: -70,
    depth: 2,
  },
  {
    src: '/assets/webp/dokita.webp',
    alt: 'Dokita — telemedicine platform',
    className: 'bottom-0 left-[6%] w-[82%]',
    rotate: -1.5,
    z: 0,
    depth: 3,
  },
];

/**
 * A collage of real project screenshots on staggered 3D depth planes. The
 * whole scene tilts a few degrees toward the pointer — it reads as WebGL but
 * is three transformed divs, so it costs nothing to ship.
 */
function ProofStack({ disabled }: { disabled: boolean }) {
  const nx = useMotionValue(0);
  const ny = useMotionValue(0);
  const springConfig = { damping: 30, stiffness: 120, mass: 0.6 };
  const rotateY = useSpring(useTransform(nx, [-1, 1], [-6, 6]), springConfig);
  const rotateX = useSpring(useTransform(ny, [-1, 1], [6, -6]), springConfig);

  useEffect(() => {
    if (disabled) return;

    const handleMouseMove = (e: MouseEvent) => {
      nx.set((e.clientX / window.innerWidth - 0.5) * 2);
      ny.set((e.clientY / window.innerHeight - 0.5) * 2);
    };

    window.addEventListener('mousemove', handleMouseMove);

    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [disabled, nx, ny]);

  return (
    <div
      aria-hidden="true"
      className="relative h-[34vh] min-h-[260px] w-full lg:h-[46vh] lg:max-h-[560px] lg:min-h-[380px]"
      style={{ perspective: '1400px' }}
    >
      <m.div
        className="absolute inset-0"
        style={{
          transformStyle: 'preserve-3d',
          rotateX: disabled ? 0 : rotateX,
          rotateY: disabled ? 0 : rotateY,
        }}
        animate={disabled ? undefined : { y: [0, -12, 0] }}
        transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
      >
        {proofShots.map((shot) => (
          <m.div
            key={shot.src}
            className={`absolute overflow-hidden rounded-sm bg-white ring-1 ring-black/5 ${shot.className}`}
            style={{
              zIndex: shot.depth,
              boxShadow:
                '0 30px 60px -18px rgba(0,0,0,0.5), 0 12px 24px -12px rgba(0,0,0,0.3)',
              transform: `translateZ(${shot.z}px) rotate(${shot.rotate}deg)`,
            }}
            whileHover={disabled ? undefined : { scale: 1.04, zIndex: 10 }}
            transition={{ type: 'spring', stiffness: 260, damping: 22 }}
          >
            <div className="border-ink/10 flex items-center gap-1.5 border-b bg-white px-3 py-2">
              <span className="h-2 w-2 rounded-sm bg-[#ff5f57]" />
              <span className="h-2 w-2 rounded-sm bg-[#febc2e]" />
              <span className="h-2 w-2 rounded-sm bg-[#28c840]" />
            </div>
            <Image
              src={shot.src}
              alt={shot.alt}
              width={840}
              height={520}
              priority={shot.depth === 3}
              quality={90}
              sizes="(min-width: 1024px) 44vw, (min-width: 768px) 60vw, 0px"
              className="h-auto w-full object-cover"
            />
          </m.div>
        ))}

        {/* Floating label */}
        <span
          className="bg-paper text-ink font-family-inter absolute -top-3 right-[4%] z-10 rotate-3 rounded-sm px-3.5 py-1.5 text-[10px] font-semibold tracking-[0.18em] uppercase shadow-lg"
          style={{ transform: 'translateZ(40px) rotate(3deg)' }}
        >
          Shipped for real clients
        </span>
      </m.div>
    </div>
  );
}

export default function Hero() {
  const [isCalendlyOpen, setIsCalendlyOpen] = useState(false);
  const [viewportHeight, setViewportHeight] = useState(800);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    setViewportHeight(window.innerHeight);
  }, []);

  // The hero is pinned (sticky) while the rest of the page slides over it,
  // so plain document scroll drives its recede animation.
  const { scrollY } = useScroll();
  const scale = useTransform(scrollY, [0, viewportHeight * 0.9], [1, 0.95]);
  const opacity = useTransform(scrollY, [0, viewportHeight * 0.9], [1, 0.3]);
  const y = useTransform(scrollY, [0, viewportHeight * 0.9], [0, -40]);

  const recedeStyle = prefersReducedMotion ? undefined : { scale, opacity, y };

  const enter = (delay: number) =>
    prefersReducedMotion
      ? {}
      : {
          initial: { opacity: 0, y: 16 },
          animate: { opacity: 1, y: 0 },
          transition: {
            delay,
            duration: 0.55,
            ease: [0.22, 1, 0.36, 1] as const,
          },
        };

  return (
    <section
      id="home"
      className="bg-ink sticky top-0 z-0 -mt-[4.5rem] flex h-dvh w-full flex-col overflow-hidden md:-mt-[8.25rem]"
    >
      {/* Depth on the dark surface: a faint paper lift over the headline and
          a soft sky wash behind the collage. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(50% 65% at 18% 42%, rgba(217,217,217,0.06), transparent 70%)',
        }}
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(45% 65% at 82% 62%, rgba(123,182,221,0.14), transparent 70%)',
        }}
      />

      <m.div
        style={recedeStyle}
        className="relative z-10 flex h-full w-full flex-col justify-between px-4 pt-[6rem] pb-8 md:px-10 md:pt-[10.25rem]"
      >
        {/* Headline + CTAs + proof collage */}
        <div className="grid flex-1 items-center gap-10 lg:grid-cols-[11fr_9fr] lg:gap-6">
          <div className="flex flex-col gap-8 md:gap-10">
            <div className="flex flex-col gap-3 md:gap-4">
              {/* Eyebrow sits directly on the headline */}
              <m.p
                {...enter(0)}
                className="font-family-inter text-paper/70 text-xs font-medium tracking-[0.3em] uppercase md:text-sm"
              >
                Jeremiah Okon — Frontend &amp; Full-Stack Developer
                <span className="text-paper/40 hidden sm:inline">
                  {' '}
                  · React · Next.js · Node.js
                </span>
              </m.p>
              <m.h1
                {...enter(0)}
                className="text-paper text-[clamp(3.25rem,8.5vw,9.5rem)] leading-[0.95] font-bold tracking-tighter"
              >
                Websites that load{' '}
                <em className="font-family-instrument text-sky font-normal italic">
                  fast
                </em>{' '}
                — and sell faster.
              </m.h1>
            </div>

            {/* Trust strip */}
            <m.a
              {...enter(0.15)}
              href={UPWORK_PROFILE_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                sendGAEvent({
                  event: GA_EVENTS.UPWORK_STATS_ON_HERO,
                  value: 'Hero trust strip',
                  event_category: 'engagement',
                });
              }}
              className="font-family-inter text-paper/70 hover:text-paper flex w-fit flex-wrap items-center gap-x-3 gap-y-1 text-sm transition-colors md:text-base"
              aria-label="4.9 star average rating from 6 client reviews on Upwork — view profile"
            >
              <span>
                <span className="text-[#e58f2a]">4.9★</span> Upwork rating
              </span>
              <span aria-hidden="true" className="text-paper/30">
                ·
              </span>
              <span>6 client reviews</span>
              <span aria-hidden="true" className="text-paper/30">
                ·
              </span>
              <span className="flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-sm bg-[#14A800] opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-sm bg-[#14A800]" />
                </span>
                Available now
              </span>
            </m.a>

            {/* CTAs — visible fast; a 6-second visitor must see these */}
            <m.div
              {...enter(0.3)}
              className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-5"
            >
              <m.button
                onClick={() => {
                  sendGAEvent({
                    event: GA_EVENTS.BOOK_CALL_ON_HERO,
                    value: 'Book a Free Call',
                    event_category: 'conversion',
                  });
                  setIsCalendlyOpen(true);
                }}
                className="bg-paper text-ink group relative overflow-hidden rounded-sm px-8 py-4 shadow-2xl transition-shadow duration-300 hover:shadow-[0_0_60px_rgba(123,182,221,0.45)] md:px-10 md:py-5"
                whileHover={
                  prefersReducedMotion ? undefined : { scale: 1.04, y: -2 }
                }
                whileTap={prefersReducedMotion ? undefined : { scale: 0.96 }}
              >
                <span className="relative z-10 flex items-center gap-3 text-base font-black tracking-wide whitespace-nowrap uppercase md:text-lg">
                  <m.span
                    className="inline-flex"
                    animate={
                      prefersReducedMotion
                        ? undefined
                        : { scale: [1, 1.2, 1], rotate: [0, 5, -5, 0] }
                    }
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      ease: 'easeInOut',
                    }}
                  >
                    <Calendar className="h-5 w-5 md:h-6 md:w-6" />
                  </m.span>
                  Book a Free Call
                </span>
              </m.button>

              <a
                href={UPWORK_PROFILE_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  sendGAEvent({
                    event: GA_EVENTS.UPWORK_BADGE_ON_HERO,
                    value: 'Hire me on Upwork',
                    event_category: 'engagement',
                  });
                }}
                className="inline-flex items-center gap-2.5 rounded-sm border border-[#1DB954]/40 bg-[#14A800]/15 px-5 py-3 text-sm font-semibold whitespace-nowrap text-[#3ddc74] transition-all duration-300 hover:border-[#1DB954]/60 hover:bg-[#14A800]/25 md:text-base"
                aria-label="View my Upwork profile"
              >
                <UpworkIcon className="h-5 w-5" />
                <span>Hire me on Upwork</span>
              </a>
            </m.div>
          </div>

          {/* Collage bleeds into the right edge of the viewport */}
          <m.div
            {...enter(0.4)}
            className="mx-auto hidden w-full max-w-xl md:block lg:mx-0 lg:-mr-10 lg:max-w-none"
          >
            <ProofStack disabled={prefersReducedMotion} />
          </m.div>
        </div>

        {/* Scroll cue */}
        <m.div
          {...enter(0.5)}
          className="font-family-inter text-paper/50 flex items-center gap-3 text-xs tracking-[0.25em] uppercase"
        >
          <span>Scroll</span>
          <m.span
            aria-hidden="true"
            className="bg-paper/40 block h-px w-10 origin-left"
            animate={
              prefersReducedMotion ? undefined : { scaleX: [0.3, 1, 0.3] }
            }
            transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
          />
          <span className="text-paper/40">The work is right below</span>
        </m.div>
      </m.div>

      <CalendlyModal
        isOpen={isCalendlyOpen}
        onClose={() => setIsCalendlyOpen(false)}
        url={BOOK_A_CALL}
        title="Let's Chat - Book Your Free Call"
      />
    </section>
  );
}
