import { DEFAULT_MAP_CENTER, MARKER_COLORS } from '../../utils/constants';
import { normalizePoints, toLatLng } from '../../utils/geo';

/** Keep only markers with valid coordinates; fill in colour defaults. */
export function cleanMarkers(markers) {
  if (!Array.isArray(markers)) return [];
  return markers
    .map((m, i) => {
      const ll = toLatLng(m);
      if (!ll) return null;
      return {
        ...m,
        ...ll,
        id: m.id ?? `${m.type || 'm'}-${i}`,
        color: m.color || MARKER_COLORS[m.type] || '#1C2833',
      };
    })
    .filter(Boolean);
}

export function cleanPath(polyline) {
  return normalizePoints(polyline);
}

export function resolveCenter(center, markers) {
  return toLatLng(center) || (markers[0] ? { lat: markers[0].lat, lng: markers[0].lng } : null) || DEFAULT_MAP_CENTER;
}

/** Changes only when the *set* of things on the map changes (not when a marker moves), to avoid re-fitting constantly. */
export function shapeKey(markers, path) {
  return `${markers.map((m) => m.id).join('|')}#${path.length > 1 ? 'p' : ''}`;
}

export function allPoints(markers, path) {
  return [...markers.map((m) => [m.lat, m.lng]), ...path];
}

const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export { escapeHtml };
