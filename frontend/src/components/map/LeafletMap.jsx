import { useEffect, useMemo } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet';
import { allPoints, escapeHtml, shapeKey } from './mapUtils';

const iconCache = new Map();

function markerIcon(marker) {
  const big = marker.type === 'volunteer' || marker.big;
  const pulse = marker.type === 'volunteer' || marker.pulse;
  const short = marker.shortLabel ? escapeHtml(String(marker.shortLabel).slice(0, 24)) : '';
  const key = `${marker.color}|${big}|${pulse}|${short}|${marker.type}`;
  if (iconCache.has(key)) return iconCache.get(key);
  const size = big ? 24 : 18;
  const html = `<div class="yw-marker-dot ${big ? 'yw-lg' : ''} ${pulse ? 'yw-marker-pulse' : ''}" style="background:${marker.color};color:${marker.color}">${
    short ? `<span class="yw-marker-label">${short}</span>` : ''
  }</div>`;
  const icon = L.divIcon({
    className: 'yw-marker',
    html,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    tooltipAnchor: [0, -size / 2],
    popupAnchor: [0, -size / 2],
  });
  iconCache.set(key, icon);
  return icon;
}

function ViewController({ markers, path, center, zoom, fitBounds }) {
  const map = useMap();
  const key = fitBounds ? shapeKey(markers, path) : `${center.lat},${center.lng},${zoom}`;

  useEffect(() => {
    const pts = allPoints(markers, path);
    if (fitBounds && pts.length > 1) {
      map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 15, animate: true });
    } else if (fitBounds && pts.length === 1) {
      map.setView(pts[0], Math.max(zoom, 14), { animate: true });
    } else {
      map.setView([center.lat, center.lng], zoom, { animate: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map]);

  // Leaflet needs a nudge when its container is resized (tabs, responsive layouts).
  useEffect(() => {
    const el = map.getContainer();
    if (typeof ResizeObserver === 'undefined' || !el) return undefined;
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el);
    return () => ro.disconnect();
  }, [map]);

  return null;
}

export default function LeafletMap({ markers, path, center, zoom, fitBounds, polylineColor, dashed, onMarkerClick }) {
  const positions = useMemo(() => path.map(([lat, lng]) => [lat, lng]), [path]);
  return (
    <MapContainer center={[center.lat, center.lng]} zoom={zoom} scrollWheelZoom={false} className="h-full w-full" attributionControl>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        maxZoom={19}
      />
      {positions.length > 1 ? (
        <Polyline
          positions={positions}
          pathOptions={{ color: polylineColor, weight: 5, opacity: 0.85, dashArray: dashed ? '8 10' : undefined, lineCap: 'round' }}
        />
      ) : null}
      {markers.map((m) => (
        <Marker
          key={m.id}
          position={[m.lat, m.lng]}
          icon={markerIcon(m)}
          zIndexOffset={m.type === 'volunteer' ? 1000 : 0}
          eventHandlers={onMarkerClick ? { click: () => onMarkerClick(m) } : undefined}
          keyboard
          title={m.label || m.type}
        >
          {m.label || m.description ? (
            <Tooltip direction="top" offset={[0, -4]}>
              <div className="text-xs">
                {m.label ? <div className="font-semibold">{m.label}</div> : null}
                {m.description ? <div className="text-slate-600">{m.description}</div> : null}
              </div>
            </Tooltip>
          ) : null}
        </Marker>
      ))}
      <ViewController markers={markers} path={path} center={center} zoom={zoom} fitBounds={fitBounds} />
    </MapContainer>
  );
}
