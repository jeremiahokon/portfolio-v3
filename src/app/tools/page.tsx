import { Link as TransitionLink } from 'next-view-transitions';

import { Check } from 'lucide-react';
import type { Metadata } from 'next';

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
        <span className="font-family-inter text-ink/50 text-xs font-medium tracking-[0.3em] uppercase">
          [ TOOLS ]
        </span>
        <h1 className="text-footer-background max-w-3xl text-4xl leading-[1.05] font-bold tracking-tight md:text-6xl lg:text-7xl">
          Free tools, built in the{' '}
          <em className="font-family-instrument font-normal italic">browser</em>
          .
        </h1>
        <p className="font-family-inter text-ink/50 max-w-xl text-lg md:text-xl">
          No uploads, no accounts. Everything runs locally — the same
          engineering I bring to client work.
        </p>
      </div>

      {/* Tool grid */}
      <div className="grid w-full max-w-6xl grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {tools.map((tool) => {
          const Icon = tool.icon;
          const isLive = tool.status === 'live';

          const cardBody = (
            <>
              <div className="flex items-center justify-between">
                <span className="bg-sky/15 flex h-11 w-11 items-center justify-center rounded-xl">
                  <Icon className="text-sky-deep h-5 w-5" strokeWidth={1.5} />
                </span>
                {isLive ? (
                  <span className="font-family-inter bg-sky/15 text-sky-deep rounded-full px-3 py-1 text-[10px] font-medium tracking-[0.15em] uppercase">
                    Free · Private
                  </span>
                ) : (
                  <span className="font-family-inter text-ink/50 bg-ink/5 rounded-full px-3 py-1 text-[10px] font-medium tracking-[0.15em] uppercase">
                    Coming soon
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <h2 className="text-footer-background flex items-baseline gap-2.5 text-xl font-bold tracking-tight md:text-2xl">
                  {tool.name}
                  {isLive && (
                    <em className="font-family-instrument text-sky-deep text-lg font-normal italic opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                      open
                    </em>
                  )}
                </h2>
                <p className="font-family-inter text-ink/60 text-sm leading-relaxed">
                  {tool.description}
                </p>
              </div>

              <ul className="mt-auto flex flex-wrap gap-x-4 gap-y-1.5">
                {tool.perks.map((perk) => (
                  <li
                    key={perk}
                    className="font-family-inter text-ink/60 flex items-center gap-1.5 text-xs"
                  >
                    <Check className="text-sky-deep h-3.5 w-3.5" />
                    {perk}
                  </li>
                ))}
              </ul>
            </>
          );

          const cardClass =
            'flex h-full flex-col gap-5 rounded-2xl border border-[#2C3333]/10 bg-[#2C3333]/[0.03] p-7';

          if (!isLive) {
            return (
              <div
                key={tool.slug}
                aria-disabled="true"
                className={`${cardClass} opacity-55`}
              >
                {cardBody}
              </div>
            );
          }

          return (
            <TransitionLink
              key={tool.slug}
              href={tool.href}
              className={`${cardClass} group hover:border-sky/40 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl`}
            >
              {cardBody}
            </TransitionLink>
          );
        })}
      </div>

      <p className="font-family-inter text-ink/50 mt-14 max-w-md text-center text-sm leading-relaxed">
        More tools are on the way. Want one built for your team?{' '}
        <TransitionLink
          href="/#contact"
          className="font-family-instrument text-sky-deep text-base italic underline-offset-4 hover:underline"
        >
          let&apos;s talk
        </TransitionLink>
      </p>
    </section>
  );
}
