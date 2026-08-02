import { Calendar } from 'lucide-react';

import { TrackedLink } from '@/ui/tracked-link';

import { BOOK_A_CALL } from '@/lib/constant';

// Conversion band for pages that pull outside traffic (tools, extractor).
// Booking a call is the site's conversion point — every page needs a path
// to it, not just the homepage.
export function BookCallCta({ location }: { location: string }) {
  return (
    <div className="border-ink/10 bg-ink/[0.03] mx-auto mt-20 flex w-full max-w-2xl flex-col items-center gap-5 rounded-3xl border px-6 py-10 text-center md:px-12">
      <p className="text-footer-background text-2xl font-bold tracking-tight md:text-3xl">
        I build fast web tools like this{' '}
        <em className="font-family-instrument text-sky-deep font-normal italic">
          for clients
        </em>
        .
      </p>
      <p className="font-family-inter text-ink/60 max-w-md text-sm md:text-base">
        Need a web app, a landing page that converts, or a tool for your team?
        Let&apos;s talk about it — the call is free.
      </p>
      <TrackedLink
        href={BOOK_A_CALL}
        gaEvent={{
          event: 'book_call_click',
          value: 'Book a Free Call',
          button_location: location,
          event_category: 'conversion',
          event_label: 'cta_button',
        }}
        className="bg-footer-background inline-flex items-center gap-3 rounded-full px-8 py-4 text-sm font-black tracking-wide text-white uppercase shadow-2xl transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_0_50px_rgba(123,182,221,0.4)] md:text-base"
      >
        <Calendar className="h-5 w-5" />
        Book a Free Call
      </TrackedLink>
    </div>
  );
}
