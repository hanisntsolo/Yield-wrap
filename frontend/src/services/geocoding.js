// Geocoding helpers: Google Geocoder when the Maps API is loaded, OpenStreetMap Nominatim otherwise.
import { toLatLng } from '../utils/geo';

const NOMINATIM = 'https://nominatim.openstreetmap.org';

/** Free-text search -> [{address, lat, lng}] (max `limit`). */
export async function searchAddress(query, { limit = 5, signal } = {}) {
  const q = String(query || '').trim();
  if (q.length < 3) return [];
  const url = `${NOMINATIM}/search?format=json&q=${encodeURIComponent(q)}&limit=${limit}&addressdetails=0`;
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Address search failed (${res.status})`);
  const rows = await res.json();
  return (Array.isArray(rows) ? rows : [])
    .map((r) => ({ address: r.display_name, lat: Number(r.lat), lng: Number(r.lon) }))
    .filter((r) => toLatLng(r));
}

function googleGeocode(request) {
  return new Promise((resolve) => {
    const Geocoder = window.google?.maps?.Geocoder;
    if (!Geocoder) return resolve(null);
    try {
      new Geocoder().geocode(request, (results, status) => {
        if (status !== 'OK' || !results?.length) return resolve(null);
        const r = results[0];
        resolve({
          address: r.formatted_address,
          lat: r.geometry.location.lat(),
          lng: r.geometry.location.lng(),
        });
      });
    } catch {
      resolve(null);
    }
  });
}

/** Coordinates -> human address. Always resolves (falls back to a coordinate string). */
export async function reverseGeocode(lat, lng) {
  const fallback = { address: `Current location (${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)})`, lat, lng };
  try {
    const g = await googleGeocode({ location: { lat, lng } });
    if (g) return { ...g, lat, lng };
    const res = await fetch(`${NOMINATIM}/reverse?format=json&lat=${lat}&lon=${lng}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return fallback;
    const json = await res.json();
    return json?.display_name ? { address: json.display_name, lat, lng } : fallback;
  } catch {
    return fallback;
  }
}

/** Ensure a {address, lat, lng} value has coordinates, geocoding the address text if needed. */
export async function resolveLocation(value) {
  if (!value) return null;
  const ll = toLatLng(value);
  if (ll) return { address: value.address || '', ...ll };
  const text = String(value.address || '').trim();
  if (text.length < 3) return null;
  try {
    const g = await googleGeocode({ address: text });
    if (g) return g;
    const [first] = await searchAddress(text, { limit: 1 });
    return first ? { ...first, address: text } : null;
  } catch {
    return null;
  }
}

/** Browser geolocation as a promise. */
export function getCurrentPosition(options = {}) {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Geolocation is not supported by this browser.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      (err) => reject(new Error(err?.code === 1 ? 'Location permission denied.' : 'Unable to get your location.')),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000, ...options },
    );
  });
}
