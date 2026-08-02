'use client';

import { useState } from 'react';
import { sendGAEvent } from '@next/third-parties/google';

import { Calendar, Mail } from 'lucide-react';
import { m } from 'motion/react';

import { CalendlyModal } from '@/components/calendly-modal';

import { BOOK_A_CALL, EMAIL } from '@/lib/constant';
import { useReducedMotion } from '@/lib/hooks';

export default function Contact() {
  const [isCalendlyOpen, setIsCalendlyOpen] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  return (
    <section
      id="contact"
      className="relative flex w-full flex-col items-center justify-center overflow-hidden px-4 py-24 md:min-h-[80vh] md:px-10 md:py-32"
    >
      {/* Background gradient mesh */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div
          className={`absolute -top-1/4 -left-1/4 h-[600px] w-[600px] rounded-full bg-[#7BB6DD]/15 blur-[120px] ${
            prefersReducedMotion ? '' : 'animate-gradient-mesh-1'
          }`}
        />
        <div
          className={`absolute top-1/4 -right-1/4 h-[500px] w-[500px] rounded-full bg-[#5BA4D1]/10 blur-[100px] ${
            prefersReducedMotion ? '' : 'animate-gradient-mesh-2'
          }`}
        />
        <div
          className={`absolute -bottom-1/4 left-1/3 h-[550px] w-[550px] rounded-full bg-[#a855f7]/8 blur-[110px] ${
            prefersReducedMotion ? '' : 'animate-gradient-mesh-3'
          }`}
        />
      </div>

      {/* Proof at the moment of decision — verbatim Upwork review */}
      <m.figure
        className="mb-10 flex max-w-2xl flex-col items-center gap-3 text-center"
        initial={prefersReducedMotion ? undefined : { opacity: 0, y: 20 }}
        whileInView={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        viewport={{ once: true }}
      >
        <blockquote className="font-family-instrument text-ink/80 text-xl italic md:text-2xl">
          &ldquo;Jeremiah understands the customer requirement from very little
          information provided. I love working with him.&rdquo;
        </blockquote>
        <figcaption className="font-family-inter text-ink/50 text-xs tracking-[0.2em] uppercase">
          Upwork client · React frontend development
        </figcaption>
      </m.figure>

      {/* Heading */}
      <m.h2
        className={`mb-6 text-center text-5xl leading-[1.05] font-bold tracking-tight md:text-7xl lg:text-8xl xl:text-9xl ${
          prefersReducedMotion
            ? 'text-[#2C3333]'
            : 'animate-gradient-text bg-gradient-to-r from-[#2C3333] via-[#7BB6DD] to-[#2C3333]'
        }`}
        initial={prefersReducedMotion ? undefined : { opacity: 0, y: 30 }}
        whileInView={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        viewport={{ once: true }}
      >
        Got a{' '}
        <span className="font-family-instrument font-normal italic">
          project
        </span>{' '}
        in mind?
      </m.h2>

      {/* Subline */}
      <m.p
        className="font-family-inter mb-12 text-center text-lg text-[#2C3333]/50 md:text-xl"
        initial={prefersReducedMotion ? undefined : { opacity: 0, y: 20 }}
        whileInView={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
        viewport={{ once: true }}
      >
        Let&apos;s build something worth remembering.
      </m.p>

      {/* Buttons */}
      <m.div
        className="flex flex-col items-center gap-4 sm:flex-row sm:gap-6"
        initial={prefersReducedMotion ? undefined : { opacity: 0, y: 20 }}
        whileInView={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.4 }}
        viewport={{ once: true }}
      >
        {/* Primary CTA */}
        <m.button
          onClick={() => {
            sendGAEvent({
              event: 'book_call_click',
              value: 'Book a Free Call',
              button_location: 'contact',
              event_category: 'conversion',
              event_label: 'cta_button',
            });
            setIsCalendlyOpen(true);
          }}
          className="group relative overflow-hidden rounded-full px-10 py-5 text-white shadow-2xl transition-all duration-300 hover:shadow-[0_0_60px_rgba(123,182,221,0.4)] md:px-12 md:py-6"
          whileHover={prefersReducedMotion ? undefined : { scale: 1.05, y: -4 }}
          whileTap={prefersReducedMotion ? undefined : { scale: 0.95 }}
        >
          {/* Animated gradient background */}
          <m.div
            className="absolute inset-0 bg-gradient-to-r from-[#7BB6DD] via-[#5BA4D1] to-[#7BB6DD]"
            animate={
              prefersReducedMotion
                ? undefined
                : { backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'] }
            }
            transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
            style={{ backgroundSize: '200% 100%' }}
          />
          <span className="relative z-10 flex items-center gap-3 text-lg font-black tracking-wide uppercase md:text-xl">
            <m.div
              animate={
                prefersReducedMotion
                  ? undefined
                  : { scale: [1, 1.2, 1], rotate: [0, 5, -5, 0] }
              }
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            >
              <Calendar className="h-6 w-6 md:h-7 md:w-7" />
            </m.div>
            Book a Free Call
          </span>
          {/* Ripple effect on hover */}
          <m.div
            className="absolute inset-0 rounded-full bg-white/50"
            initial={{ scale: 0, opacity: 0.5 }}
            whileHover={{ scale: 2, opacity: 0, transition: { duration: 0.6 } }}
          />
        </m.button>

        {/* Secondary CTA */}
        <m.a
          href={`https://mail.google.com/mail/?view=cm&to=${EMAIL}&su=Project%20Inquiry`}
          target="_blank"
          rel="noopener noreferrer"
          className="group relative overflow-hidden rounded-full px-10 py-5 shadow-2xl transition-all duration-300 hover:shadow-[0_0_60px_rgba(123,182,221,0.25)] md:px-12 md:py-6"
          whileHover={prefersReducedMotion ? undefined : { scale: 1.05, y: -4 }}
          whileTap={prefersReducedMotion ? undefined : { scale: 0.95 }}
          onClick={() => {
            sendGAEvent({
              event: 'email_click',
              value: 'Send an Email',
              button_location: 'contact',
              event_category: 'conversion',
              event_label: 'email_button',
            });
          }}
        >
          {/* Animated border-style gradient background */}
          <div className="absolute inset-0 rounded-full bg-gradient-to-r from-[#7BB6DD]/20 via-[#5BA4D1]/30 to-[#7BB6DD]/20 backdrop-blur-sm" />
          <div className="absolute inset-[2px] rounded-full bg-white/90" />
          <span className="relative z-10 flex items-center gap-3 text-lg font-black tracking-wide text-[#2C3333] uppercase md:text-xl">
            <m.div
              animate={prefersReducedMotion ? undefined : { y: [0, -3, 0] }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            >
              <Mail className="h-6 w-6 text-[#2C3333] md:h-7 md:w-7" />
            </m.div>
            Send an Email
          </span>
        </m.a>
      </m.div>

      <CalendlyModal
        isOpen={isCalendlyOpen}
        onClose={() => setIsCalendlyOpen(false)}
        url={BOOK_A_CALL}
        title="Let's Chat - Book Your Free Call"
      />
    </section>
  );
}
