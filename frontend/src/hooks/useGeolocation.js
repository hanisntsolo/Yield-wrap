import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Browser geolocation.
 *   watch=false: call `request()` to get a single fix.
 *   watch=true + enabled: continuous watchPosition; `position` updates at most every `throttleMs`.
 * Returns { position:{lat,lng,accuracy,timestamp}|null, error, loading, supported, request }.
 */
export default function useGeolocation({ watch = false, enabled = true, throttleMs = 0, highAccuracy = true } = {}) {
  const supported = typeof navigator !== 'undefined' && Boolean(navigator.geolocation);
  const [position, setPosition] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const lastEmit = useRef(0);

  const toPos = (p) => ({
    lat: p.coords.latitude,
    lng: p.coords.longitude,
    accuracy: p.coords.accuracy,
    timestamp: p.timestamp || Date.now(),
  });

  const onError = useCallback((err) => {
    setLoading(false);
    setError(err?.code === 1 ? 'Location permission denied.' : err?.message || 'Unable to get your location.');
  }, []);

  const request = useCallback(() => {
    if (!supported) {
      setError('Geolocation is not supported by this browser.');
      return Promise.resolve(null);
    }
    setLoading(true);
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (p) => {
          const next = toPos(p);
          setPosition(next);
          setError(null);
          setLoading(false);
          resolve(next);
        },
        (err) => {
          onError(err);
          resolve(null);
        },
        { enableHighAccuracy: highAccuracy, timeout: 15000, maximumAge: 15000 },
      );
    });
  }, [supported, highAccuracy, onError]);

  useEffect(() => {
    if (!watch || !enabled || !supported) return undefined;
    setLoading(true);
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const now = Date.now();
        setLoading(false);
        if (throttleMs && now - lastEmit.current < throttleMs) return;
        lastEmit.current = now;
        setPosition(toPos(p));
        setError(null);
      },
      onError,
      { enableHighAccuracy: highAccuracy, timeout: 20000, maximumAge: 5000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [watch, enabled, supported, throttleMs, highAccuracy, onError]);

  return { position, error, loading, supported, request };
}
