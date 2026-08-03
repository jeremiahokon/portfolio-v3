'use client';

import { sendGAEvent } from '@next/third-parties/google';

export function TrackedLink({
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
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      onClick={() => sendGAEvent(gaEvent)}
    >
      {children}
    </a>
  );
}
