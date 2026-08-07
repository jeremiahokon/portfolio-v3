'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Link as TransitionLink } from 'next-view-transitions';
import { sendGAEvent } from '@next/third-parties/google';

import { AnimatePresence, m } from 'motion/react';

import { LocalTimeClock } from '@/ui/local-time-clock';

import { GA_EVENTS } from '@/lib/analytics-events';
import { EMAIL } from '@/lib/constant';
import { useReducedMotion } from '@/lib/hooks';
import { isHomePathname } from '@/lib/utils';

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const pathname = usePathname();
  const isHome = isHomePathname(pathname);
  const reduced = useReducedMotion();

  // On the home page these are in-page anchors we scroll to smoothly. On any
  // other route (e.g. /extract-audio) there is nothing to scroll to, so the
  // links point at `/#id` and we let the browser navigate home instead.
  const hashHref = (id: string) => (isHome ? `#${id}` : `/#${id}`);

  // Lock body scroll while the full-screen menu is open, and let Escape close
  // it. Hiding overflow removes the scrollbar, so we pad the body by its width
  // to avoid a jump. Both are tiny effects — no libraries, negligible JS cost.
  useEffect(() => {
    if (!isMenuOpen) return;
    const { overflow, paddingRight } = document.body.style;
    const scrollbarWidth =
      window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);

    return () => {
      document.body.style.overflow = overflow;
      document.body.style.paddingRight = paddingRight;
      window.removeEventListener('keydown', onKey);
    };
  }, [isMenuOpen]);

  const handleNavClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    id: string
  ) => {
    setIsMenuOpen(false);
    sendGAEvent({
      event: GA_EVENTS.NAV_LINK_ON_HEADER,
      value: id,
      link_id: id,
      event_category: 'engagement',
    });
    if (!isHome) return; // let the anchor navigate to `/#id`
    e.preventDefault();
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const navLinks = [
    { id: 'home', label: 'Home' },
    { id: 'work', label: 'Work' },
    { id: 'about', label: 'About' },
    { id: 'tools', label: 'Tools', href: '/tools' },
    { id: 'reviews', label: 'Reviews' },
    { id: 'content', label: 'Content' },
    { id: 'contact', label: 'Contact' },
  ];

  // Light over the dark home hero, dark ink on the light tool pages.
  const tone = isHome ? 'text-paper' : 'text-footer-background';

  // The circle grows from the toggle button (top-right) so the overlay reads as
  // an expansion of the hamburger itself. Reduced-motion users get a plain fade.
  const CIRCLE_ORIGIN = 'at 92% 6%';
  // A gentle ease-in-out so the circle accelerates and settles softly rather
  // than snapping. Opening: a faint crossfade softens the growing circle's
  // edge. Closing: the circle stays fully opaque and contracts back into the
  // button, so the menu retracts the same way it projected out.
  const SMOOTH = [0.33, 0, 0.15, 1] as const;
  const overlayMotion = reduced
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1, transition: { duration: 0.25 } },
        exit: { opacity: 0, transition: { duration: 0.25 } },
      }
    : {
        initial: { clipPath: `circle(0% ${CIRCLE_ORIGIN})`, opacity: 0 },
        animate: {
          clipPath: `circle(150% ${CIRCLE_ORIGIN})`,
          opacity: 1,
          transition: {
            clipPath: { duration: 0.7, ease: SMOOTH },
            opacity: { duration: 0.25, ease: 'easeOut' as const },
          },
        },
        exit: {
          clipPath: `circle(0% ${CIRCLE_ORIGIN})`,
          opacity: 1,
          transition: { clipPath: { duration: 0.6, ease: SMOOTH } },
        },
      };

  return (
    <>
      <header className="relative z-50 flex w-full items-center justify-between px-4 py-4 md:items-start md:px-10 md:pt-10 md:pb-5">
        <m.a
          href={hashHref('home')}
          onClick={(e) => handleNavClick(e, 'home')}
          className="group relative cursor-pointer"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <span
            className={`font-family-instrument ${tone} text-3xl leading-[100%] font-normal tracking-tight italic md:text-4xl`}
          >
            JO
          </span>
          <m.div
            className={`absolute -inset-2 rounded-sm border-2 border-current opacity-0 group-hover:opacity-100 ${tone}`}
            initial={{ scale: 0.8, opacity: 0 }}
            whileHover={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.3 }}
          />
        </m.a>

        <div
          className={`flex flex-col items-center justify-center gap-3 ${tone}`}
        >
          <LocalTimeClock />
          <Link
            href={`mailto:${EMAIL}`}
            target="_blank"
            className="hidden text-xl leading-[100%] font-medium -tracking-[1%] text-current md:inline-block"
            onClick={() => {
              sendGAEvent({
                event: GA_EVENTS.EMAIL_ON_HEADER,
                value: EMAIL,
                event_category: 'engagement',
              });
            }}
          >
            {EMAIL}
          </Link>
        </div>

        {/* Animated hamburger — the only nav control on every breakpoint. */}
        <button
          type="button"
          aria-label="Open menu"
          aria-expanded={isMenuOpen}
          aria-controls="site-menu"
          onClick={() => setIsMenuOpen(true)}
          className={`group ${tone} relative flex h-8 w-9 cursor-pointer items-center justify-center`}
        >
          <span className="sr-only">Menu</span>
          <span className="relative block h-[14px] w-7" aria-hidden="true">
            <span className="absolute top-0 left-0 h-0.5 w-full origin-center rounded-sm bg-current transition-all duration-300 group-hover:w-5" />
            <span className="absolute bottom-0 left-0 h-0.5 w-full rounded-sm bg-current transition-all duration-300 group-hover:w-full" />
          </span>
        </button>
      </header>

      {/* Full-screen menu with a circular reveal that grows from the button. */}
      <AnimatePresence>
        {isMenuOpen && (
          <m.div
            id="site-menu"
            role="dialog"
            aria-modal="true"
            aria-label="Site navigation"
            className="bg-footer-background fixed inset-0 z-[100] flex flex-col items-center justify-center"
            {...overlayMotion}
          >
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setIsMenuOpen(false)}
              className="group absolute top-4 right-4 flex h-11 w-11 cursor-pointer items-center justify-center rounded-sm text-white transition-colors hover:bg-white/10 md:top-9 md:right-9"
            >
              <span className="relative block h-5 w-5" aria-hidden="true">
                <span className="absolute top-1/2 left-0 h-0.5 w-full -translate-y-1/2 rotate-45 rounded-sm bg-current transition-transform duration-300 group-hover:rotate-[135deg]" />
                <span className="absolute top-1/2 left-0 h-0.5 w-full -translate-y-1/2 -rotate-45 rounded-sm bg-current transition-transform duration-300 group-hover:rotate-[-135deg]" />
              </span>
            </button>

            <m.nav
              className="flex flex-col items-center gap-4 md:gap-5"
              initial="hidden"
              animate="visible"
              variants={{
                hidden: { opacity: 0 },
                visible: {
                  opacity: 1,
                  transition: {
                    staggerChildren: 0.05,
                    delayChildren: reduced ? 0 : 0.25,
                  },
                },
              }}
            >
              {navLinks.map((link) => {
                const itemVariants = {
                  hidden: { opacity: 0, y: reduced ? 0 : 24 },
                  visible: {
                    opacity: 1,
                    y: 0,
                    transition: {
                      duration: 0.7,
                      ease: [0.16, 1, 0.3, 1] as const,
                    },
                  },
                };

                if (link.href) {
                  return (
                    <m.span
                      key={link.id}
                      variants={itemVariants}
                      whileHover={reduced ? undefined : { x: 10 }}
                      transition={{
                        type: 'spring',
                        stiffness: 260,
                        damping: 24,
                      }}
                    >
                      <TransitionLink
                        href={link.href}
                        onClick={() => {
                          setIsMenuOpen(false);
                          sendGAEvent({
                            event: GA_EVENTS.NAV_LINK_ON_MOBILE_MENU,
                            value: link.id,
                            link_id: link.id,
                            event_category: 'engagement',
                          });
                        }}
                        className="cursor-pointer text-3xl font-bold tracking-tighter text-white transition-colors hover:text-gray-300 md:text-4xl"
                      >
                        {link.label}
                      </TransitionLink>
                    </m.span>
                  );
                }

                return (
                  <m.a
                    key={link.id}
                    href={hashHref(link.id)}
                    onClick={(e) => handleNavClick(e, link.id)}
                    className="cursor-pointer text-3xl font-bold tracking-tighter text-white transition-colors hover:text-gray-300 md:text-4xl"
                    variants={itemVariants}
                    whileHover={reduced ? undefined : { x: 10 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 24 }}
                  >
                    {link.label}
                  </m.a>
                );
              })}
            </m.nav>

            <m.div
              className="absolute bottom-8 text-sm text-white/60"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: reduced ? 0 : 0.5 }}
            >
              Tap a link to navigate
            </m.div>
          </m.div>
        )}
      </AnimatePresence>
    </>
  );
}
