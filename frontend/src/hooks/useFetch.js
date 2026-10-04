import { useCallback, useEffect, useRef, useState } from 'react';
import usePolling from './usePolling';

/**
 * Minimal data-fetching hook.
 *   const { data, loading, error, reload, setData } = useFetch(() => api.thing(), [deps], { pollMs, enabled })
 * `loading` is true only for the first load (and after deps change); polling refreshes silently.
 */
export default function useFetch(fetcher, deps = [], { pollMs = 0, enabled = true, initialData = null } = {}) {
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError] = useState(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const requestId = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async ({ silent = false } = {}) => {
    const id = ++requestId.current;
    if (!silent) setLoading(true);
    try {
      const result = await fetcherRef.current();
      if (mounted.current && id === requestId.current) {
        setData(result);
        setError(null);
      }
      return result;
    } catch (err) {
      if (mounted.current && id === requestId.current) setError(err);
      return undefined;
    } finally {
      if (mounted.current && id === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, run, ...deps]);

  usePolling(() => run({ silent: true }), pollMs, { enabled: enabled && pollMs > 0 });

  const reload = useCallback(() => run({ silent: true }), [run]);

  return { data, loading, error, reload, setData };
}
