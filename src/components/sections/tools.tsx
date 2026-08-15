import { TrackedTransitionLink } from '@/ui/tracked-transition-link';

import { GA_EVENTS } from '@/lib/analytics-events';
import { tools } from '@/lib/tools';

// This banner used to advertise one tool. It named the audio extractor in the
// heading, described only the audio extractor, and put "browse all tools" — the
// only hint that a second one existed — in small text under the button. A reader
// who did not want to strip audio out of a video had no reason to click anything.
//
// The tools are the most underused asset on the site: they are free, they need no
// account, and they run entirely on the visitor's own machine, which is a live
// demonstration of the engineering rather than a claim about it. So the banner now
// renders every entry in lib/tools.ts as its own card with its own CTA. Ship a
// third tool and it appears here automatically — nothing in this file names one.
export default function Tools() {
  return (
    <section
      id="tools"
      className="relative w-full px-4 py-16 md:px-10 md:py-20"
    >
      <div className="mx-auto max-w-6xl">
        <div className="relative flex flex-col gap-8 overflow-hidden rounded-sm border border-[#2C3333]/10 bg-[#2C3333]/[0.03] p-8 md:p-10">
          {/* Ambient glow */}
          <div className="bg-sky/15 pointer-events-none absolute -top-1/3 -right-1/4 h-[300px] w-[300px] rounded-sm blur-[110px]" />

          <div className="relative z-10 flex max-w-2xl flex-col gap-4">
            <span className="font-family-inter bg-sky/15 text-sky-text w-fit rounded-sm px-3 py-1 text-[10px] font-medium tracking-[0.15em] uppercase">
              Free tools · {tools.length} live
            </span>

            <h2 className="text-footer-background text-3xl leading-tight font-bold tracking-tight md:text-4xl">
              {tools.length} free tools —{' '}
              <em className="font-family-instrument font-normal italic">
                no signup, nothing uploaded
              </em>
              .
            </h2>

            <p className="font-family-inter text-ink/85 text-base leading-relaxed">
              Both run entirely inside your browser — your files never leave
              your device. Same privacy-first engineering I bring to client
              work, free to use right now.
            </p>
          </div>

          <div className="relative z-10 grid gap-5 sm:grid-cols-2">
            {tools.map((tool) => {
              const Icon = tool.icon;

              return (
                <div
                  key={tool.slug}
                  className="flex flex-col gap-4 rounded-sm border border-[#2C3333]/10 bg-white/60 p-6"
                >
                  <span className="bg-sky/15 flex h-11 w-11 items-center justify-center rounded-sm">
                    <Icon className="text-sky-text h-5 w-5" strokeWidth={1.5} />
                  </span>

                  <div className="flex flex-col gap-1.5">
                    <h3 className="text-footer-background text-lg font-bold tracking-tight">
                      {tool.name}
                    </h3>
                    <p className="font-family-inter text-ink/80 text-sm leading-relaxed">
                      {tool.tagline}
                    </p>
                  </div>

                  <ul className="font-family-inter flex flex-wrap gap-x-3 gap-y-1 text-[11px] tracking-[0.08em] text-[#2C3333]/70 uppercase">
                    {tool.perks.map((perk) => (
                      <li key={perk}>{perk}</li>
                    ))}
                  </ul>

                  <TrackedTransitionLink
                    href={tool.href}
                    gaEvent={{
                      event: GA_EVENTS.OPEN_EXTRACTOR_ON_BANNER,
                      value: `Open ${tool.name}`,
                      event_category: 'engagement',
                    }}
                    className="from-sky to-sky-deep mt-auto inline-flex items-center justify-center gap-2 rounded-sm bg-gradient-to-r px-6 py-3 text-sm font-black tracking-wide text-white uppercase shadow-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_0_50px_rgba(123,182,221,0.4)]"
                  >
                    {tool.cta}
                  </TrackedTransitionLink>
                </div>
              );
            })}
          </div>

          <TrackedTransitionLink
            href="/tools"
            gaEvent={{
              event: GA_EVENTS.BROWSE_TOOLS_ON_BANNER,
              value: 'browse all tools',
              event_category: 'engagement',
            }}
            className="text-link relative z-10 w-fit text-lg"
          >
            browse all tools
          </TrackedTransitionLink>
        </div>
      </div>
    </section>
  );
}
