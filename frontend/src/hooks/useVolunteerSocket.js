import { useCallback, useEffect, useRef, useState } from 'react';
import { WS_URL } from '../utils/constants';
import { toLatLng } from '../utils/geo';

const MAX_BACKOFF = 30000;

/**
 * Live volunteer position over `/ws/volunteer/{id}/location` (cookie-authenticated).
 * Reconnects with exponential backoff. Returns { position, connected, send }.
 *   position: { volunteer_id, lat, lng, timestamp } | null
 *   send({lat, lng}) -> boolean (false when the socket is not open)
 */
export default function useVolunteerSocket(volunteerId, { enabled = true } = {}) {
  const [position, setPosition] = useState(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);

  useEffect(() => {
    setPosition(null);
    if (!volunteerId || !enabled || typeof WebSocket === 'undefined') return undefined;

    let closedByUs = false;
    let attempt = 0;
    let timer = null;

    const connect = () => {
      let ws;
      try {
        ws = new WebSocket(`${WS_URL}/ws/volunteer/${encodeURIComponent(volunteerId)}/location`);
      } catch {
        scheduleReconnect();
        return;
      }
      wsRef.current = ws;
      ws.onopen = () => {
        attempt = 0;
        setConnected(true);
      };
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          const ll = toLatLng(msg);
          if (!ll) return;
          setPosition({
            volunteer_id: msg.volunteer_id ?? volunteerId,
            lat: ll.lat,
            lng: ll.lng,
            timestamp: msg.timestamp || new Date().toISOString(),
          });
        } catch {
          /* ignore non-JSON frames (pings etc.) */
        }
      };
      ws.onerror = () => {
        /* onclose handles reconnects */
      };
      ws.onclose = (event) => {
        setConnected(false);
        if (wsRef.current === ws) wsRef.current = null;
        // 1008 / 4401 / 4403: policy / auth rejection — don't hammer the server.
        if (closedByUs || [1008, 4001, 4401, 4403].includes(event?.code)) return;
        scheduleReconnect();
      };
    };

    function scheduleReconnect() {
      if (closedByUs) return;
      const delay = Math.min(MAX_BACKOFF, 1000 * 2 ** attempt) + Math.random() * 500;
      attempt += 1;
      timer = setTimeout(connect, delay);
    }

    connect();
    return () => {
      closedByUs = true;
      clearTimeout(timer);
      const ws = wsRef.current;
      wsRef.current = null;
      setConnected(false);
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        try {
          ws.close(1000, 'unmount');
        } catch {
          /* noop */
        }
      }
    };
  }, [volunteerId, enabled]);

  const send = useCallback((payload) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    try {
      ws.send(JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }, []);

  return { position, connected, send };
}
