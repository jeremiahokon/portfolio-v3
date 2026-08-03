'use client';

import { useId } from 'react';

import { m } from 'motion/react';

import { useReducedMotion } from '@/lib/hooks';
import { cn } from '@/lib/utils';

type IconProps = { className?: string };

// Idle: a soft cloud with an up-arrow that gently bobs, inviting a drop.
export function UploadCloudAnim({ className }: IconProps) {
  const reduced = useReducedMotion();
  // useId keeps gradient ids unique per instance — hardcoded ids collide when
  // two icons mount at once.
  const gradId = useId();

  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      className={cn('h-full w-full', className)}
      aria-hidden
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#7BB6DD" />
          <stop offset="100%" stopColor="#5BA4D1" />
        </linearGradient>
      </defs>
      {/* Cloud */}
      <path
        d="M20 44a10 10 0 0 1-1.5-19.9A14 14 0 0 1 45 26.5 9 9 0 0 1 45 44H20Z"
        fill={`url(#${gradId})`}
        opacity={0.16}
        stroke={`url(#${gradId})`}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      {/* Bobbing arrow */}
      <m.g
        animate={reduced ? undefined : { y: [0, -4, 0] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
      >
        <path
          d="M32 48V30"
          stroke={`url(#${gradId})`}
          strokeWidth={3.5}
          strokeLinecap="round"
        />
        <path
          d="M24 37l8-8 8 8"
          stroke={`url(#${gradId})`}
          strokeWidth={3.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </m.g>
    </svg>
  );
}

// Loading / processing: an equalizer of bars pulsing like a soundwave.
export function EqualizerBars({ className }: IconProps) {
  const reduced = useReducedMotion();
  const gradId = useId();
  const bars = [
    { x: 8, base: 18, delay: 0 },
    { x: 18, base: 30, delay: 0.15 },
    { x: 28, base: 12, delay: 0.3 },
    { x: 38, base: 26, delay: 0.45 },
    { x: 48, base: 20, delay: 0.6 },
  ];

  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      className={cn('h-full w-full', className)}
      aria-hidden
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7BB6DD" />
          <stop offset="100%" stopColor="#5BA4D1" />
        </linearGradient>
      </defs>
      {bars.map((bar) => {
        const short = bar.base * 0.4;

        return (
          <m.rect
            key={bar.x}
            x={bar.x}
            width={8}
            rx={4}
            fill={`url(#${gradId})`}
            initial={{ height: bar.base, y: 32 - bar.base / 2 }}
            animate={
              reduced
                ? { height: bar.base, y: 32 - bar.base / 2 }
                : {
                    height: [bar.base, short, bar.base],
                    y: [32 - bar.base / 2, 32 - short / 2, 32 - bar.base / 2],
                  }
            }
            transition={{
              duration: 0.9,
              repeat: Infinity,
              ease: 'easeInOut',
              delay: bar.delay,
            }}
          />
        );
      })}
    </svg>
  );
}

// Success: a ring plus a checkmark drawn on via pathLength.
export function SuccessCheck({ className }: IconProps) {
  const reduced = useReducedMotion();

  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      className={cn('h-full w-full', className)}
      aria-hidden
    >
      <m.circle
        cx={32}
        cy={32}
        r={26}
        stroke="#10b981"
        strokeWidth={3}
        fill="#10b981"
        fillOpacity={0.12}
        initial={reduced ? undefined : { pathLength: 0, opacity: 0 }}
        animate={reduced ? undefined : { pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      />
      <m.path
        d="M21 33l7 7 15-16"
        stroke="#10b981"
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={reduced ? undefined : { pathLength: 0 }}
        animate={reduced ? undefined : { pathLength: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut', delay: 0.35 }}
      />
    </svg>
  );
}
