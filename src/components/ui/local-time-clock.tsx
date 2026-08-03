'use client';

import { useEffect, useState } from 'react';

import { AnimatePresence, m } from 'motion/react';

function getCurrentTime() {
  return new Date().toLocaleTimeString('en-US', {
    timeZone: 'Africa/Lagos',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function LocalTimeClock() {
  // Starts null so the first client render matches the server-rendered
  // placeholder exactly; the real time fills in right after mount.
  const [time, setTime] = useState<string | null>(null);

  useEffect(() => {
    setTime(getCurrentTime());
    const id = setInterval(() => setTime(getCurrentTime()), 1000);

    return () => clearInterval(id);
  }, []);

  if (!time) {
    return (
      <span className="flex flex-col items-center gap-1">
        <span className="text-xs font-medium tracking-widest text-current uppercase opacity-70">
          Local Time
        </span>
        <span className="text-xl leading-[100%] font-normal -tracking-[2%] text-current opacity-70">
          --:-- GMT+1
        </span>
      </span>
    );
  }

  // Split "2:32 PM" into hours, minutes, period
  const colonIndex = time.indexOf(':');
  const hours = time.slice(0, colonIndex);
  const rest = time.slice(colonIndex + 1); // "32 PM"
  const minutes = rest.slice(0, 2);
  const period = rest.slice(2).trim(); // "PM"

  return (
    <m.span
      className="flex flex-col items-center gap-1"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
    >
      <span className="text-xs font-medium tracking-widest text-current uppercase opacity-70">
        Local Time
      </span>
      <span className="inline-flex items-baseline text-xl leading-[100%] font-normal -tracking-[2%] text-current opacity-70">
        <span>{hours}</span>
        <m.span
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut' }}
        >
          :
        </m.span>
        <AnimatePresence mode="popLayout">
          <m.span
            key={minutes}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.3 }}
          >
            {minutes}
          </m.span>
        </AnimatePresence>
        <span className="ml-1">{period}</span>
        <span className="ml-1.5 text-sm text-current opacity-50">GMT+1</span>
      </span>
    </m.span>
  );
}
