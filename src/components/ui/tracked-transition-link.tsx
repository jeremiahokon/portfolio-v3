'use client';

import { Link as TransitionLink } from 'next-view-transitions';
import { sendGAEvent } from '@next/third-parties/google';

// Internal-navigation sibling of TrackedLink: fires a GA event on click while
// keeping the view-transition navigation.
export function TrackedTransitionLink({
  href,
  className,
  children,
  gaEvent,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
  gaEvent: Record<string, string>;
}) {
  return (
    <TransitionLink
      href={href}
      className={className}
      onClick={() => sendGAEvent(gaEvent)}
    >
      {children}
    </TransitionLink>
  );
}
