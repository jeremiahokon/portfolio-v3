'use client';

import { ChevronDown } from 'lucide-react';
import { m } from 'motion/react';

export function ScrollButton() {
  const handleScroll = () => {
    window.scrollTo({
      top: window.innerHeight,
      behavior: 'smooth',
    });
  };

  return (
    <m.button
      onClick={handleScroll}
      className="group border-footer-background hover:bg-footer-background/5 relative flex h-24 w-24 items-center justify-center rounded-full border-2 bg-transparent transition-all"
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.95 }}
    >
      {/* Rotating border circle */}
      <m.div
        className="border-t-footer-background absolute inset-0 rounded-full border-2 border-transparent"
        animate={{
          rotate: 360,
        }}
        transition={{
          duration: 3,
          repeat: Infinity,
          ease: 'linear',
        }}
      />

      {/* Second rotating circle for enhanced effect */}
      <m.div
        className="border-b-footer-background absolute inset-2 rounded-full border-2 border-transparent"
        animate={{
          rotate: -360,
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: 'linear',
        }}
      />

      {/* Arrow icon */}
      <m.div
        className="relative z-10 flex items-center justify-center"
        animate={{
          y: [0, 4, 0],
        }}
        transition={{
          duration: 1.5,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      >
        <ChevronDown
          className="text-footer-background h-8 w-8"
          strokeWidth={2}
        />
      </m.div>

      {/* Pulsing background effect */}
      <m.div
        className="bg-footer-background absolute inset-0 rounded-full opacity-0"
        animate={{
          scale: [1, 1.3, 1],
          opacity: [0, 0.1, 0],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />
    </m.button>
  );
}
