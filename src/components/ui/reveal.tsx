'use client';

import { m } from 'motion/react';
import type { ReactNode } from 'react';

import { useReducedMotion } from '@/lib/hooks';

/**
 * Shared in-view reveal used by every section so the whole page eases with
 * one voice. Fades up 24px once, ~60% of the way into the viewport.
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
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-10% 0px' }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </Component>
  );
}
