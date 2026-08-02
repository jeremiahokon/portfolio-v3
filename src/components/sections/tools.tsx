import { Link as TransitionLink } from 'next-view-transitions';

import { AudioLines } from 'lucide-react';

export default function Tools() {
  return (
    <section
      id="tools"
      className="relative w-full px-4 py-16 md:px-10 md:py-20"
    >
      <div className="mx-auto max-w-6xl">
        <div className="relative flex flex-col gap-8 overflow-hidden rounded-3xl border border-[#2C3333]/10 bg-[#2C3333]/[0.03] p-8 md:flex-row md:items-center md:justify-between md:p-10">
          {/* Ambient glow */}
          <div className="bg-sky/15 pointer-events-none absolute -top-1/3 -right-1/4 h-[300px] w-[300px] rounded-full blur-[110px]" />

          <div className="relative z-10 flex max-w-xl flex-col gap-4">
            <div className="flex items-center gap-3">
              <span className="bg-sky/15 flex h-11 w-11 items-center justify-center rounded-xl">
                <AudioLines
                  className="text-sky-deep h-5 w-5"
                  strokeWidth={1.5}
                />
              </span>
              <span className="font-family-inter bg-sky/15 text-sky-deep rounded-full px-3 py-1 text-[10px] font-medium tracking-[0.15em] uppercase">
                Free tools
              </span>
            </div>

            <h2 className="text-footer-background text-3xl leading-tight font-bold tracking-tight md:text-4xl">
              I build free tools too —{' '}
              <em className="font-family-instrument font-normal italic">
                try one
              </em>
              .
            </h2>

            <p className="font-family-inter text-ink/70 text-base leading-relaxed">
              Like a video → MP3 extractor that runs entirely in your browser.
              Nothing uploaded, no account — the same privacy-first engineering
              I bring to client work.
            </p>
          </div>

          <div className="relative z-10 flex shrink-0 flex-col items-start gap-4 md:items-end">
            <TransitionLink
              href="/extract-audio"
              className="from-sky to-sky-deep inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r px-7 py-3.5 text-sm font-black tracking-wide text-white uppercase shadow-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_0_50px_rgba(123,182,221,0.4)]"
            >
              Open the audio extractor
            </TransitionLink>
            <TransitionLink href="/tools" className="text-link text-xl">
              browse all tools
            </TransitionLink>
          </div>
        </div>
      </div>
    </section>
  );
}
