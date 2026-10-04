import { useMemo } from 'react';
import { HAS_GOOGLE_MAPS } from '../utils/constants';
import LeafletMap from './map/LeafletMap';
import GoogleMapView from './map/GoogleMapView';
import { cleanMarkers, cleanPath, resolveCenter } from './map/mapUtils';
import Icon from './common/Icon';

/**
 * One map API for Google Maps (when VITE_GOOGLE_MAPS_API_KEY is set) and Leaflet/OpenStreetMap (fallback).
 *   markers:  [{ id, lat, lng, type: 'donation'|'ngo'|'volunteer'|'pickup'|'delivery', label, description?, color?, shortLabel? }]
 *   polyline: [[lat, lng], ...]
 * Invalid / missing coordinates are dropped silently.
 */
export default function MapView({
  markers = [],
  polyline = [],
  center,
  zoom = 13,
  height = 360,
  fitBounds = true,
  polylineColor = '#1A7A4A',
  dashed = false,
  emptyMessage = 'No locations to show yet',
  className = '',
  onMarkerClick,
  children,
}) {
  const clean = useMemo(() => cleanMarkers(markers), [markers]);
  const path = useMemo(() => cleanPath(polyline), [polyline]);
  const resolvedCenter = resolveCenter(center, clean);
  const centerKey = `${resolvedCenter.lat},${resolvedCenter.lng}`;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stableCenter = useMemo(() => resolvedCenter, [centerKey]);
  const isEmpty = clean.length === 0 && path.length === 0 && !center;
  const effectiveZoom = isEmpty ? 4 : zoom;

  const Impl = HAS_GOOGLE_MAPS ? GoogleMapView : LeafletMap;

  return (
    <div
      className={`yw-map relative w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 ${className}`}
      style={{ height: typeof height === 'number' ? `${height}px` : height }}
    >
      <Impl
        markers={clean}
        path={path}
        center={stableCenter}
        zoom={effectiveZoom}
        fitBounds={fitBounds && !isEmpty}
        polylineColor={polylineColor}
        dashed={dashed}
        onMarkerClick={onMarkerClick}
      />
      {isEmpty ? (
        <div className="pointer-events-none absolute inset-0 z-[500] flex items-center justify-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/95 px-4 py-2 text-xs font-medium text-slate-600 shadow">
            <Icon name="map-pin" size={14} />
            {emptyMessage}
          </span>
        </div>
      ) : null}
      {children}
    </div>
  );
}
