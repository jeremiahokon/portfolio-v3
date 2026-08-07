'use client';

import { m } from 'motion/react';
import type { ReactNode } from 'react';

import { useReducedMotion } from '@/lib/hooks';

/**
 * Shared in-view reveal used by every section so the whole page eases with
 * one voice. Slides up 24px once, ~60% of the way into the viewport.
 */

/**
 * The reveal moves; it does not fade. That is an accessibility fix, and I got it
 * wrong once before landing here.
 *
 * Fading a *container* multiplies its opacity into every colour inside it, and this
 * site's muted text is already an alpha of `--ink`. So `text-ink/75` — which clears
 * 4.5:1 on its own — sits at an effective 0.56 inside a 0.75 container and fails.
 * My first attempt raised the fade's floor to the measured 0.75 minimum and the
 * failing-node count went *up*, from 50 to 72, because the two alphas compound. There
 * is no floor that fixes it: any container opacity below 1 drags every muted colour
 * under the minimum for the length of the animation.
 *
 * A 24px slide is a transform. It is composited, it costs no contrast at any frame,
 * and it does not gate largest-contentful-paint the way an opacity animation does. The
 * entrance still reads as an entrance.
 *
 * To restore the fade, add `opacity` back to both states — and accept that muted text
 * is unreadable while it runs.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  as = 'div',
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: 'div' | 'section' | 'span' | 'p' | 'li';
}) {
  const prefersReducedMotion = useReducedMotion();
  const Component = m[as];

  if (prefersReducedMotion) {
    const Static = as;

    return <Static className={className}>{children}</Static>;
  }

  return (
    <Component
      className={className}
      initial={{ y: 24 }}
      whileInView={{ y: 0 }}
      viewport={{ once: true, margin: '-10% 0px' }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </Component>
  );
}
