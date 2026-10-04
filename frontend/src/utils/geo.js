// Coordinate helpers + Google encoded-polyline decoder.

const num = (v) => (v === null || v === undefined || v === '' ? NaN : Number(v));

export function isValidLatLng(lat, lng) {
  const a = num(lat);
  const b = num(lng);
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a) <= 90 && Math.abs(b) <= 180 && !(a === 0 && b === 0);
}

/**
 * Normalise anything location-like into {lat, lng} or null.
 * Accepts {lat,lng}, {latitude,longitude}, {lat,lon}, [lat,lng], GeoJSON {coordinates:[lng,lat]}.
 */
export function toLatLng(loc) {
  if (!loc) return null;
  if (Array.isArray(loc)) {
    return loc.length >= 2 && isValidLatLng(loc[0], loc[1]) ? { lat: Number(loc[0]), lng: Number(loc[1]) } : null;
  }
  if (typeof loc !== 'object') return null;
  if (Array.isArray(loc.coordinates) && loc.coordinates.length >= 2) {
    const [lng, lat] = loc.coordinates;
    return isValidLatLng(lat, lng) ? { lat: Number(lat), lng: Number(lng) } : null;
  }
  const lat = loc.lat ?? loc.latitude;
  const lng = loc.lng ?? loc.lon ?? loc.longitude;
  return isValidLatLng(lat, lng) ? { lat: Number(lat), lng: Number(lng) } : null;
}

export function hasCoords(loc) {
  return toLatLng(loc) !== null;
}

/** Great-circle distance in km. */
export function haversineKm(a, b) {
  const p = toLatLng(a);
  const q = toLatLng(b);
  if (!p || !q) return null;
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(q.lat - p.lat);
  const dLng = toRad(q.lng - p.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(p.lat)) * Math.cos(toRad(q.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Decode a Google encoded polyline string into [[lat, lng], ...]. */
export function decodePolyline(encoded, precision = 5) {
  if (!encoded || typeof encoded !== 'string') return [];
  const factor = 10 ** precision;
  const points = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  try {
    while (index < encoded.length) {
      let result = 0;
      let shift = 0;
      let byte;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20 && index < encoded.length);
      lat += result & 1 ? ~(result >> 1) : result >> 1;

      result = 0;
      shift = 0;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20 && index < encoded.length);
      lng += result & 1 ? ~(result >> 1) : result >> 1;

      const p = [lat / factor, lng / factor];
      if (isValidLatLng(p[0], p[1])) points.push(p);
    }
  } catch {
    return points;
  }
  return points;
}

/** Normalise a list of points ([lat,lng] or {lat,lng}) into valid [[lat,lng], ...]. */
export function normalizePoints(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((p) => toLatLng(p))
    .filter(Boolean)
    .map((p) => [p.lat, p.lng]);
}

/**
 * Resolve the drawable path of an /api/ai/route response.
 * Prefers decoded `points`, then decodes `polyline` (string or list), then straight lines through `fallbackStops`.
 */
export function routePath(route, fallbackStops = []) {
  const fromPoints = normalizePoints(route?.points);
  if (fromPoints.length > 1) return fromPoints;
  const poly = route?.polyline;
  const fromPoly = typeof poly === 'string' ? decodePolyline(poly) : normalizePoints(poly);
  if (fromPoly.length > 1) return fromPoly;
  return normalizePoints(fallbackStops);
}

/** Google Maps directions deep link. */
export function googleMapsDirectionsUrl({ origin, destination, waypoints = [], travelMode = 'driving' }) {
  const fmt = (p) => {
    const ll = toLatLng(p);
    return ll ? `${ll.lat},${ll.lng}` : null;
  };
  const params = new URLSearchParams({ api: '1', travelmode: travelMode });
  const dest = fmt(destination);
  if (dest) params.set('destination', dest);
  const org = fmt(origin);
  if (org) params.set('origin', org);
  const wps = waypoints.map(fmt).filter(Boolean);
  if (wps.length) params.set('waypoints', wps.join('|'));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
