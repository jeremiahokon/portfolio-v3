'use client';

import { sendGAEvent } from '@next/third-parties/google';

import { ArrowUpRight } from 'lucide-react';
import { m } from 'motion/react';

import { GA_EVENTS } from '@/lib/analytics-events';
import { UPWORK_PROFILE_URL } from '@/lib/constant';
import { useCountUp, useReducedMotion } from '@/lib/hooks';

interface Stat {
  target: number;
  prefix?: string;
  suffix: string;
  decimals: number;
  label: string;
  href?: string;
}

// Every number here is verifiable: years are backed by the work section, the live
// product count is the work section, and the Upwork stats link to the profile.
//
// **"$1K+ Earned on Upwork" used to sit in the third slot and was actively working
// against the page.** A four-figure lifetime total reads as "has barely worked"
// however true it is, so the one stat meant to build confidence was the one costing
// it — and revenue on a page whose job is to open a conversation invites the reader
// to price the work before they know what it is.
//
// "Live In Production" replaces it because it is the strongest thing that is *also*
// true and checkable — all seven URLs in the work section were requested and returned
// 200 before this number was written down, since claiming a dead site is live would be
// worse than the stat it replaced.
//
// It is deliberately not another count of contracts. A job is work won; a product
// still serving traffic is work that survived, which is what a prospective client is
// actually trying to find out. The label says "in production" rather than "products"
// for that reason, and because it happens to equal the Upwork job count — a reader
// who notices should read "every job shipped something that is still running", not
// "someone pasted the same number twice". It links to the work section, not Upwork,
// because that is where the seven live links are.
const stats: Stat[] = [
  { target: 4, suffix: '+', decimals: 0, label: 'Years Experience' },
  {
    target: 7,
    suffix: '',
    decimals: 0,
    label: 'Jobs on Upwork',
    href: UPWORK_PROFILE_URL,
  },
  {
    target: 7,
    suffix: '',
    decimals: 0,
    label: 'Live In Production',
    href: '#work',
  },
  {
    target: 4.9,
    suffix: '★',
    decimals: 1,
    label: 'Avg. Upwork Rating',
    href: UPWORK_PROFILE_URL,
  },
];

function StatItem({ stat, index }: { stat: Stat; index: number }) {
  const { target, prefix, suffix, decimals, label, href } = stat;
  const isInternal = href?.startsWith('#') ?? false;
  const prefersReducedMotion = useReducedMotion();
  const { count, ref } = useCountUp(
    target,
    prefersReducedMotion ? 0 : 2000,
    true,
    decimals
  );

  const displayValue = (prefersReducedMotion ? target : count).toFixed(
    decimals
  );

  const content = (
    <>
      <span
        className={`text-ink leading-none font-bold ${
          href
            ? 'group-hover/stat:text-sky-deep transition-colors duration-300'
            : ''
        }`}
        style={{ fontSize: 'clamp(3rem, 8vw, 7rem)' }}
      >
        {prefix}
        {displayValue}
        {suffix === '★' ? (
          <span className="text-[#e58f2a]" style={{ fontSize: '0.6em' }}>
            {suffix}
          </span>
        ) : (
          suffix
        )}
      </span>
      <span className="font-family-inter text-ink/40 flex items-center gap-1 text-xs font-medium tracking-[0.2em] uppercase md:text-sm">
        {label}
        {href && (
          <ArrowUpRight className="h-3.5 w-3.5 opacity-0 transition-opacity duration-300 group-hover/stat:opacity-100" />
        )}
      </span>
    </>
  );

  return (
    <m.div
      ref={ref}
      className="flex flex-col items-center gap-2 text-center"
      initial={prefersReducedMotion ? undefined : { opacity: 0, y: 20 }}
      whileInView={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: index * 0.1 }}
      viewport={{ once: true, amount: 0.5 }}
    >
      {href ? (
        <a
          href={href}
          // An in-page anchor must not open a tab, and must not claim to be Upwork.
          // Deriving both from the href keeps a future stat from inheriting the wrong
          // behaviour just because it borrowed this component.
          {...(isInternal
            ? {}
            : { target: '_blank', rel: 'noopener noreferrer' })}
          className="group/stat flex flex-col items-center gap-2"
          aria-label={
            isInternal
              ? `${label} — jump to the work section`
              : `${label} — view on Upwork`
          }
          onClick={() => {
            sendGAEvent({
              event: isInternal
                ? GA_EVENTS.WORK_STAT_ON_STATS
                : GA_EVENTS.UPWORK_STAT_ON_STATS,
              value: label,
              stat_label: label,
              event_category: 'engagement',
            });
          }}
        >
          {content}
        </a>
      ) : (
        content
      )}
    </m.div>
  );
}

export default function Stats() {
  return (
    <section className="relative w-full px-4 py-20 md:px-10 md:py-32">
      {/* Top gradient divider */}
      <div className="mx-auto mb-16 h-px max-w-5xl bg-gradient-to-r from-transparent via-[#7BB6DD]/30 to-transparent" />

      <div className="mx-auto grid max-w-5xl grid-cols-2 gap-10 md:grid-cols-4 md:gap-8">
        {stats.map((stat, index) => (
          <StatItem key={stat.label} stat={stat} index={index} />
        ))}
      </div>

      {/* Bottom gradient divider */}
      <div className="mx-auto mt-16 h-px max-w-5xl bg-gradient-to-r from-transparent via-[#7BB6DD]/30 to-transparent" />
    </section>
  );
}
