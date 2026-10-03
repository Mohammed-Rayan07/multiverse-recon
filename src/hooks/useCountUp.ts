import { useEffect, useState } from 'react';

/** Animates a number from its previous value to `target` (ease-out). */
export function useCountUp(target: number, ms = 900, delay = 0): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let raf = 0;
    const from = 0;
    const startAt = performance.now() + delay;
    const step = (now: number) => {
      const t = Math.max(0, Math.min(1, (now - startAt) / ms));
      setValue(Math.round(from + (target - from) * (1 - (1 - t) ** 3)));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms, delay]);
  return value;
}

/** True when the viewport is phone-sized. */
export function useIsMobile(breakpoint = 768): boolean {
  const query = `(max-width: ${breakpoint - 1}px)`;
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMobile(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return mobile;
}
