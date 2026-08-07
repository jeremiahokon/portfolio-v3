'use client';

import { useId, useState } from 'react';

import { ChevronDown } from 'lucide-react';
import { m } from 'motion/react';

import type { Faq } from '@/lib/extract-audio-faqs';
import { useReducedMotion } from '@/lib/hooks';

const EASE = [0.22, 1, 0.36, 1] as const;

export function FaqAccordion({ faqs }: { faqs: Faq[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const baseId = useId();
  const reduced = useReducedMotion();
  const transition = reduced ? { duration: 0 } : { duration: 0.35, ease: EASE };

  return (
    <div className="mt-10 flex flex-col gap-4">
      {faqs.map((faq, index) => {
        const open = openIndex === index;
        const buttonId = `${baseId}-faq-button-${index}`;
        const panelId = `${baseId}-faq-panel-${index}`;

        return (
          <div
            key={faq.question}
            className="border-ink/10 bg-ink/[0.02] overflow-hidden rounded-sm border"
          >
            <h3>
              <button
                id={buttonId}
                type="button"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => setOpenIndex(open ? null : index)}
                className="flex w-full cursor-pointer items-center justify-between gap-4 p-6 text-left"
              >
                <span className="text-footer-background text-base font-bold md:text-lg">
                  {faq.question}
                </span>
                <m.span
                  aria-hidden="true"
                  className="text-sky-text shrink-0"
                  animate={{ rotate: open ? 180 : 0 }}
                  transition={transition}
                >
                  <ChevronDown className="h-5 w-5" />
                </m.span>
              </button>
            </h3>
            {/* Height-collapse only — the answers must stay in the
                server-rendered DOM so on-page content keeps matching the
                FAQPage JSON-LD. */}
            <m.div
              id={panelId}
              role="region"
              aria-labelledby={buttonId}
              initial={false}
              animate={{ height: open ? 'auto' : 0, opacity: open ? 1 : 0 }}
              transition={transition}
              className="overflow-hidden"
            >
              <p className="font-family-inter text-ink/80 px-6 pb-6 text-sm leading-relaxed">
                {faq.answer}
              </p>
            </m.div>
          </div>
        );
      })}
    </div>
  );
}
