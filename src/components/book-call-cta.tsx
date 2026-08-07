'use client';

import { useState } from 'react';
import { sendGAEvent } from '@next/third-parties/google';

import { Calendar } from 'lucide-react';
import { m } from 'motion/react';

import { CalendlyModal } from '@/components/calendly-modal';

import { type BookCallCtaLocation, GA_EVENTS } from '@/lib/analytics-events';
import { BOOK_A_CALL } from '@/lib/constant';
import { useReducedMotion } from '@/lib/hooks';

// Conversion band for pages that pull outside traffic (tools, extractor).
// Booking a call is the site's conversion point — every page needs a path
// to it, not just the homepage. Styled to mirror the homepage free-tools
// banner so the two read as one system.
export function BookCallCta({ location }: { location: BookCallCtaLocation }) {
  const [isCalendlyOpen, setIsCalendlyOpen] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  return (
    <div className="mx-auto mt-20 w-full max-w-6xl">
      <div className="border-ink/10 bg-ink/[0.03] relative flex flex-col gap-8 overflow-hidden rounded-sm border p-8 md:flex-row md:items-center md:justify-between md:p-10">
        {/* Ambient glow */}
        <div className="bg-sky/15 pointer-events-none absolute -top-1/3 -right-1/4 h-[300px] w-[300px] rounded-sm blur-[110px]" />

        <div className="relative z-10 flex max-w-xl flex-col gap-4">
          <div className="flex items-center gap-3">
            <span className="bg-sky/15 flex h-11 w-11 items-center justify-center rounded-sm">
              <Calendar className="text-sky-deep h-5 w-5" strokeWidth={1.5} />
            </span>
            <span className="font-family-inter bg-sky/15 text-sky-deep rounded-sm px-3 py-1 text-[10px] font-medium tracking-[0.15em] uppercase">
              Work with me
            </span>
          </div>

          <h2 className="text-footer-background text-3xl leading-tight font-bold tracking-tight md:text-4xl">
            I build fast web tools like this{' '}
            <em className="font-family-instrument font-normal italic">
              for clients
            </em>
            .
          </h2>

          <p className="font-family-inter text-ink/70 text-base leading-relaxed">
            Need a web app, a landing page that converts, or a tool for your
            team? Let&apos;s talk about it — the call is free.
          </p>
        </div>

        <div className="relative z-10 flex shrink-0 flex-col items-start md:items-end">
          <button
            type="button"
            onClick={() => {
              sendGAEvent({
                event: GA_EVENTS.BOOK_CALL_CTA[location],
                value: 'Book a Free Call',
                event_category: 'conversion',
              });
              setIsCalendlyOpen(true);
            }}
            className="from-sky to-sky-deep inline-flex cursor-pointer items-center justify-center gap-2 rounded-sm bg-gradient-to-r px-7 py-3.5 text-sm font-black tracking-wide text-white uppercase shadow-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_0_50px_rgba(123,182,221,0.4)]"
          >
            <m.span
              className="inline-flex"
              animate={
                prefersReducedMotion
                  ? undefined
                  : { scale: [1, 1.2, 1], rotate: [0, 5, -5, 0] }
              }
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            >
              <Calendar className="h-5 w-5" />
            </m.span>
            Book a Free Call
          </button>
        </div>
      </div>

      <CalendlyModal
        isOpen={isCalendlyOpen}
        onClose={() => setIsCalendlyOpen(false)}
        url={BOOK_A_CALL}
        title="Let's Chat - Book Your Free Call"
      />
    </div>
  );
}
