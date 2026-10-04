import { useEffect, useRef } from 'react';

/**
 * Call `callback` every `intervalMs` while `enabled`. Skips ticks while the tab is hidden and fires
 * immediately when the tab becomes visible again. The latest callback is always used.
 */
export default function usePolling(callback, intervalMs, { enabled = true, immediate = false } = {}) {
  const saved = useRef(callback);
  saved.current = callback;

  useEffect(() => {
    if (!enabled || !intervalMs) return undefined;
    const tick = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      saved.current?.();
    };
    if (immediate) tick();
    const id = setInterval(tick, intervalMs);
    const onVisible = () => {
      if (!document.hidden) saved.current?.();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, intervalMs, immediate]);
}
