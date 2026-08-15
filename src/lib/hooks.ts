'use client';

import { useEffect, useRef, useState } from 'react';

import { useReducedMotion as useFramerReducedMotion } from 'motion/react';

// Hydration-safe: the server always renders the animated branch, so the first
// client render must match it; the real preference applies right after mount.
// Components can therefore swap DOM structure on this flag without tripping
// React hydration mismatches.
export function useReducedMotion(): boolean {
  const prefersReducedMotion = useFramerReducedMotion() ?? false;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return mounted && prefersReducedMotion;
}

// The count starts *at* the target, not at zero.
//
// This looks backwards for a count-up, and it is the whole point. The previous
// version initialised to 0 and animated upward, which meant the server-rendered
// HTML — the only thing a crawler, a link-preview bot, or a JS-off reader ever
// sees — said "0.0★ Avg. Upwork Rating" and "0 Jobs on Upwork". The animation was
// publishing the opposite of every claim on the page to exactly the audiences that
// cannot run it.
//
// So the real value is the initial state and the animation is a purely visual
// overlay: once the element scrolls into view on a hydrated client, we drop to zero
// and count back up. Markup is always truthful; motion is decoration layered on top.
// If `duration` is 0 (what callers pass for reduced motion) nothing ever resets.
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
