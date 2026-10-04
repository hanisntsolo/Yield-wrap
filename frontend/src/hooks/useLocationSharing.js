import { useEffect, useRef, useState } from 'react';
import useGeolocation from './useGeolocation';
import useVolunteerSocket from './useVolunteerSocket';
import { volunteerApi } from '../services/api';

const SHARE_INTERVAL_MS = 10000;

/**
 * Volunteer GPS sharing: watchPosition (throttled ~10 s) published as {lat,lng} frames on the
 * volunteer WebSocket, falling back to PUT /api/volunteer/location when the socket is not open.
 * Returns { position, connected, error, lastSentAt, via }.
 */
export default function useLocationSharing(volunteerId, { enabled = false } = {}) {
  const active = Boolean(volunteerId) && enabled;
  const geo = useGeolocation({ watch: true, enabled: active, throttleMs: SHARE_INTERVAL_MS });
  const socket = useVolunteerSocket(volunteerId, { enabled: active });
  const [lastSentAt, setLastSentAt] = useState(null);
  const [via, setVia] = useState(null);
  const sendRef = useRef(socket.send);
  sendRef.current = socket.send;

  useEffect(() => {
    const pos = geo.position;
    if (!active || !pos) return;
    const frame = { lat: pos.lat, lng: pos.lng };
    if (sendRef.current(frame)) {
      setLastSentAt(Date.now());
      setVia('socket');
      return;
    }
    volunteerApi
      .updateLocation(pos.lat, pos.lng)
      .then(() => {
        setLastSentAt(Date.now());
        setVia('http');
      })
      .catch(() => {
        /* next fix will retry */
      });
  }, [geo.position, active]);

  return { position: geo.position, connected: socket.connected, error: geo.error, lastSentAt, via, supported: geo.supported };
}
