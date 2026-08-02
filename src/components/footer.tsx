'use client';

import { useRef, useState } from 'react';
import { sendGAEvent } from '@next/third-parties/google';

import { Calendar, ChevronUp } from 'lucide-react';
import { m, useInView } from 'motion/react';

import {
  BOOK_A_CALL,
  EMAIL,
  GITHUB_URL,
  LINKEDIN_URL,
  TIKTOK_URL,
  YOUTUBE_CHANNEL_URL,
} from '@/lib/constant';

import { CalendlyModal } from './calendly-modal';

export default function Footer() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.2 });
  const [isEmailHovered, setIsEmailHovered] = useState(false);
  const [isCalendlyOpen, setIsCalendlyOpen] = useState(false);

  const handleScrollToTop = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const headingVariants = {
    hidden: { opacity: 0, y: 50 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.8,
        ease: [0.22, 1, 0.36, 1] as const,
      },
    },
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.3,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.6,
        ease: 'easeOut' as const,
      },
    },
  };

  const socialLinks = [
    { name: 'Linkedin', url: LINKEDIN_URL },
    { name: 'Github', url: GITHUB_URL },
    { name: 'Youtube', url: YOUTUBE_CHANNEL_URL },
    { name: 'Tiktok', url: TIKTOK_URL },
  ];

  return (
    <footer
      ref={ref}
      className="bg-footer-background text-background relative flex w-full flex-col items-center justify-center gap-20 px-4 py-10 md:px-10 md:py-20"
    >
      {/* Main Heading with Gradient Animation */}
      <div className="flex w-full flex-col items-center gap-8">
        <m.span
          className="bg-gradient-to-r from-white via-gray-100 to-white bg-clip-text text-center text-[75px] leading-[100%] font-bold tracking-tighter md:text-[125px] lg:text-[164px]"
          variants={headingVariants}
          initial="hidden"
          animate={isInView ? 'visible' : 'hidden'}
        >
          Let&apos;s Create{' '}
          <span className="font-family-instrument italic">Magic!</span>
        </m.span>

        {/* CTA Button */}
        <m.button
          onClick={() => {
            sendGAEvent({
              event: 'book_call_click',
              value: 'Book a Free Call',
              button_location: 'footer',
              event_category: 'conversion',
              event_label: 'cta_button',
            });
            setIsCalendlyOpen(true);
          }}
          className="group relative overflow-hidden rounded-full bg-white px-10 py-5 text-[#0F172A] shadow-2xl transition-all duration-300 hover:shadow-[0_0_60px_rgba(255,255,255,0.4)] md:px-12 md:py-6"
          variants={headingVariants}
          initial="hidden"
          animate={isInView ? 'visible' : 'hidden'}
          whileHover={{ scale: 1.05, y: -4 }}
          whileTap={{ scale: 0.95 }}
        >
          {/* Animated gradient background */}
          <m.div
            className="absolute inset-0 bg-gradient-to-r from-white via-gray-100 to-white"
            animate={{
              backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: 'linear',
            }}
            style={{
              backgroundSize: '200% 100%',
            }}
          />

          <span className="relative z-10 flex items-center gap-3 text-xl font-black tracking-wide uppercase md:text-2xl">
            <m.div
              animate={{
                scale: [1, 1.2, 1],
                rotate: [0, 5, -5, 0],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            >
              <Calendar className="h-7 w-7 md:h-8 md:w-8" />
            </m.div>
            Book a Free Call
          </span>

          {/* Ripple effect on hover */}
          <m.div
            className="absolute inset-0 rounded-full bg-white/50"
            initial={{ scale: 0, opacity: 0.5 }}
            whileHover={{
              scale: 2,
              opacity: 0,
              transition: { duration: 0.6 },
            }}
          />
        </m.button>
      </div>

      <m.div
        className="relative flex w-full flex-col items-center justify-center gap-6"
        variants={containerVariants}
        initial="hidden"
        animate={isInView ? 'visible' : 'hidden'}
      >
        {/* Scroll to Top - Enhanced with Icon */}
        <m.div
          className="text-xl font-medium lg:absolute lg:top-0 lg:right-0"
          variants={itemVariants}
        >
          <span className="leading-[100%]"> I Scrolled too far, </span>
          <m.a
            href="#"
            onClick={handleScrollToTop}
            className="group inline-flex items-center gap-2 leading-[100%] underline"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            send me up
            <m.div
              animate={{ y: [0, -4, 0] }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            >
              <ChevronUp className="h-5 w-5 transition-colors group-hover:text-gray-300" />
            </m.div>
          </m.a>
        </m.div>

        <div className="flex flex-col items-center justify-center gap-6">
          {/* Email with Magnetic Effect */}
          <m.div variants={itemVariants}>
            <m.a
              href={`mailto:${EMAIL}`}
              target="_blank"
              className="relative text-2xl font-medium md:text-3xl"
              onMouseEnter={() => setIsEmailHovered(true)}
              onMouseLeave={() => setIsEmailHovered(false)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                sendGAEvent({
                  event: 'email_click',
                  value: EMAIL,
                  click_location: 'footer',
                  event_category: 'engagement',
                  event_label: 'contact_email',
                });
              }}
            >
              <m.span
                className="relative z-10"
                animate={{
                  color: isEmailHovered ? '#d1d5db' : '#ffffff',
                }}
                transition={{ duration: 0.3 }}
              >
                {EMAIL}
              </m.span>
              <m.div
                className="absolute inset-0 -z-0 rounded-lg bg-white/10"
                initial={{ scale: 0, opacity: 0 }}
                animate={{
                  scale: isEmailHovered ? 1 : 0,
                  opacity: isEmailHovered ? 1 : 0,
                }}
                transition={{ duration: 0.3 }}
              />
            </m.a>
          </m.div>

          {/* Social Links with Stagger Animation */}
          <m.ul
            className="flex flex-col items-center gap-3"
            variants={containerVariants}
          >
            {socialLinks.map((link) => (
              <m.li key={link.name} variants={itemVariants}>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group relative inline-block pb-1 text-lg md:text-xl"
                  onClick={() => {
                    sendGAEvent({
                      event: 'social_click',
                      value: link.name,
                      social_platform: link.name,
                      social_url: link.url,
                      event_category: 'engagement',
                      event_label: 'footer_social_links',
                    });
                  }}
                >
                  <span className="relative">
                    {link.name}
                    <span className="absolute bottom-0 left-0 h-[2px] w-full origin-left scale-x-0 bg-white transition-transform duration-300 ease-out group-hover:scale-x-100" />
                  </span>
                </a>
              </m.li>
            ))}
          </m.ul>
        </div>
      </m.div>

      {/* Copyright with Fade In */}
      <m.span
        className="text-center text-xs leading-[100%] font-medium uppercase opacity-60 md:text-base"
        variants={itemVariants}
        initial="hidden"
        animate={isInView ? 'visible' : 'hidden'}
        transition={{ delay: 0.6 }}
      >
        All rights reserved &copy; {new Date().getFullYear()} • Jeremiah Okon
      </m.span>

      <CalendlyModal
        isOpen={isCalendlyOpen}
        onClose={() => setIsCalendlyOpen(false)}
        url={BOOK_A_CALL}
        title="Let's Chat - Book Your Free Call"
      />
    </footer>
  );
}
