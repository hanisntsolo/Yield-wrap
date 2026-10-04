import { useEffect, useState } from 'react';

const get = (query) => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false);

export default function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => get(query));
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener?.('change', onChange);
    return () => mql.removeEventListener?.('change', onChange);
  }, [query]);
  return matches;
}

export const useIsDesktop = () => useMediaQuery('(min-width: 1024px)');
