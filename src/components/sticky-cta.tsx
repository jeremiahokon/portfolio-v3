'use client';

import { useEffect, useState } from 'react';
import { sendGAEvent } from '@next/third-parties/google';

import { AnimatePresence, m } from 'motion/react';

import { CalendlyModal } from '@/components/calendly-modal';

import { GA_EVENTS } from '@/lib/analytics-events';
import { BOOK_A_CALL } from '@/lib/constant';
import { useReducedMotion } from '@/lib/hooks';

/**
 * Floating "book a call" pill that appears once the visitor has scrolled past
 * the hero and hides again when the contact section (with the full-size CTAs)
 * is on screen.
 */
export function StickyCta() {
  const [pastHero, setPastHero] = useState(false);
  const [contactVisible, setContactVisible] = useState(false);
  const [isCalendlyOpen, setIsCalendlyOpen] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    const onScroll = () => {
      setPastHero(window.scrollY > window.innerHeight * 1.2);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const contact = document.getElementById('contact');
    if (!contact) return;

    const observer = new IntersectionObserver(
      ([entry]) => setContactVisible(entry.isIntersecting),
      { threshold: 0.15 }
    );
    observer.observe(contact);

    return () => observer.disconnect();
  }, []);

  const visible = pastHero && !contactVisible;

  return (
    <>
      <AnimatePresence>
        {visible && (
          <m.div
            initial={
              prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 24 }
            }
            animate={
              prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }
            }
            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 24 }}
            transition={{ type: 'spring', stiffness: 260, damping: 26 }}
            className="fixed inset-x-4 bottom-4 z-40 md:inset-x-auto md:right-8 md:bottom-8"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            <button
              type="button"
              onClick={() => {
                sendGAEvent({
                  event: GA_EVENTS.BOOK_CALL_ON_STICKY_BAR,
                  value: 'Book a Free Call',
                  event_category: 'conversion',
                });
                setIsCalendlyOpen(true);
              }}
              className="bg-footer-background font-family-inter flex w-full cursor-pointer items-center justify-center gap-2.5 rounded-full px-6 py-3.5 text-sm font-semibold text-white shadow-2xl transition-shadow duration-300 hover:shadow-[0_0_40px_rgba(123,182,221,0.45)] md:w-auto"
            >
              <span className="relative flex h-2 w-2" aria-hidden="true">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#28c840] opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[#28c840]" />
              </span>
              Available now — Book a free call
            </button>
          </m.div>
        )}
      </AnimatePresence>

      <CalendlyModal
        isOpen={isCalendlyOpen}
        onClose={() => setIsCalendlyOpen(false)}
        url={BOOK_A_CALL}
        title="Let's Chat - Book Your Free Call"
      />
    </>
  );
}
