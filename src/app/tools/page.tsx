import { Link as TransitionLink } from 'next-view-transitions';

import { Check } from 'lucide-react';
import type { Metadata } from 'next';

import { TrackedTransitionLink } from '@/ui/tracked-transition-link';

import { BookCallCta } from '@/components/book-call-cta';

import { GA_EVENTS } from '@/lib/analytics-events';
import { tools } from '@/lib/tools';

export const metadata: Metadata = {
  title: 'Free Tools',
  description:
    'Free, privacy-first web tools built by Jeremiah Okon — everything runs locally in your browser. No uploads, no accounts.',
  alternates: { canonical: '/tools' },
  openGraph: {
    title: 'Free Tools | Jeremiah Okon',
    description:
      'Free, privacy-first web tools that run entirely in your browser. No uploads, no accounts.',
    url: '/tools',
  },
};

export default function ToolsPage() {
  return (
    <section className="relative flex min-h-[70vh] w-full flex-col items-center px-4 py-20 md:px-10 md:py-28">
      {/* Header */}
      <div className="mb-14 flex flex-col items-center gap-5 text-center">
        <span className="font-family-inter text-ink/75 text-xs font-medium tracking-[0.3em] uppercase">
          [ TOOLS ]
        </span>
        <h1 className="text-footer-background max-w-3xl text-4xl leading-[1.05] font-bold tracking-tight md:text-6xl lg:text-7xl">
          Free tools, built in the{' '}
          <em className="font-family-instrument font-normal italic">browser</em>
          .
        </h1>
        <p className="font-family-inter text-ink/75 max-w-xl text-lg md:text-xl">
          No uploads, no accounts. Everything runs locally — the same
          engineering I bring to client work.
        </p>
      </div>

      {/* Tool cards — only live tools are listed */}
      <div className="flex w-full max-w-6xl flex-wrap justify-center gap-6">
        {tools.map((tool) => {
          const Icon = tool.icon;

          return (
            <TrackedTransitionLink
              key={tool.slug}
              href={tool.href}
              gaEvent={{
                event: GA_EVENTS.TOOL_CARD_ON_TOOLS_PAGE,
                value: tool.name,
                tool_name: tool.name,
                event_category: 'engagement',
              }}
              className="border-ink/10 bg-ink/[0.03] group hover:border-sky/40 flex w-full max-w-md flex-col gap-5 rounded-sm border p-7 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
            >
              <div className="flex items-center justify-between">
                <span className="bg-sky/15 flex h-11 w-11 items-center justify-center rounded-sm">
                  <Icon className="text-sky-text h-5 w-5" strokeWidth={1.5} />
                </span>
                <span className="font-family-inter bg-sky/15 text-sky-text rounded-sm px-3 py-1 text-[10px] font-medium tracking-[0.15em] uppercase">
                  Free · Private
                </span>
              </div>

              <div className="flex flex-col gap-2">
                <h2 className="text-footer-background flex items-baseline gap-2.5 text-xl font-bold tracking-tight md:text-2xl">
                  {tool.name}
                  <em className="font-family-instrument text-sky-text text-lg font-normal italic opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                    open
                  </em>
                </h2>
                <p className="font-family-inter text-ink/80 text-sm leading-relaxed">
                  {tool.description}
                </p>
              </div>

              <ul className="mt-auto flex flex-wrap gap-x-4 gap-y-1.5">
                {tool.perks.map((perk) => (
                  <li
                    key={perk}
                    className="font-family-inter text-ink/80 flex items-center gap-1.5 text-xs"
                  >
                    <Check className="text-sky-text h-3.5 w-3.5" />
                    {perk}
                  </li>
                ))}
              </ul>
            </TrackedTransitionLink>
          );
        })}
      </div>

      <p className="font-family-inter text-ink/75 mt-14 max-w-md text-center text-sm leading-relaxed">
        More tools are on the way. Want one built for your team?{' '}
        <TransitionLink href="/#contact" className="text-link text-base">
          let&apos;s talk
        </TransitionLink>
      </p>

      <BookCallCta location="tools_page" />
    </section>
  );
}
