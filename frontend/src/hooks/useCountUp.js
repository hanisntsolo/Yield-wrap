import { useEffect, useRef, useState } from 'react';

/** Animate from the previous value to `target` with an ease-out curve. Respects reduced motion. */
export default function useCountUp(target, { duration = 1600, enabled = true } = {}) {
  const [value, setValue] = useState(0);
  const fromRef = useRef(0);

  useEffect(() => {
    const end = Number(target);
    if (!enabled || !Number.isFinite(end)) return undefined;
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const start = fromRef.current;
    if (reduce || duration <= 0) {
      setValue(end);
      fromRef.current = end;
      return undefined;
    }
    let raf;
    const t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - (1 - p) ** 3;
      const next = start + (end - start) * eased;
      setValue(next);
      if (p < 1) raf = requestAnimationFrame(step);
      else fromRef.current = end;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, enabled]);

  return value;
}
