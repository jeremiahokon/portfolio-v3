'use client';

import { useEffect, useRef, useState } from 'react';

import { useReducedMotion as useFramerReducedMotion } from 'motion/react';

// Starts false so the first client render matches the server's animated branch;
// the real preference applies right after mount.
export function useReducedMotion(): boolean {
  const prefersReducedMotion = useFramerReducedMotion() ?? false;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return mounted && prefersReducedMotion;
}

// Starts *at* the target, not zero, so the server-rendered HTML a crawler or
// JS-off reader sees is never "0.0★ Avg. Upwork Rating". The animation drops to
// zero and counts back up only once hydrated and in view: markup stays
// truthful, motion is decoration on top. `duration: 0` (reduced motion) never resets.
export function useCountUp(
  target: number,
  duration: number = 2000,
  startOnView: boolean = true,
  decimals: number = 0
) {
  const [count, setCount] = useState(target);
  const [hasStarted, setHasStarted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!startOnView) {
      setHasStarted(true);

      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasStarted) {
          setHasStarted(true);
        }
      },
      { threshold: 0.3 }
    );

    if (ref.current) observer.observe(ref.current);

    return () => observer.disconnect();
  }, [startOnView, hasStarted]);

  useEffect(() => {
    if (!hasStarted) return;

    // Reduced motion (or any zero-length run) keeps the value it was born with.
    if (duration <= 0) {
      setCount(target);

      return;
    }

    const startTime = performance.now();
    let animationFrame: number;

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const factor = 10 ** decimals;
      setCount(Math.round(eased * target * factor) / factor);

      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      }
    };

    animationFrame = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(animationFrame);
  }, [hasStarted, target, duration, decimals]);

  return { count, ref };
}
