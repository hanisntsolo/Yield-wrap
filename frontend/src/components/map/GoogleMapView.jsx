import { useEffect, useMemo, useState } from 'react';
import { GoogleMap, InfoWindowF, MarkerF, PolylineF } from '@react-google-maps/api';
import { useGoogleMapsLoader } from '../../services/googleMaps';
import LeafletMap from './LeafletMap';
import { allPoints, shapeKey } from './mapUtils';

const MAP_OPTIONS = {
  streetViewControl: false,
  mapTypeControl: false,
  fullscreenControl: false,
  clickableIcons: false,
  gestureHandling: 'cooperative',
  styles: [{ featureType: 'poi.business', stylers: [{ visibility: 'off' }] }],
};

export default function GoogleMapView(props) {
  const { isLoaded, loadError } = useGoogleMapsLoader();
  if (loadError) return <LeafletMap {...props} />;
  if (!isLoaded) return <div className="skeleton h-full w-full rounded-none" aria-label="Loading map" />;
  return <GoogleMapInner {...props} />;
}

function GoogleMapInner({ markers, path, center, zoom, fitBounds, polylineColor, dashed, onMarkerClick }) {
  const [map, setMap] = useState(null);
  const [active, setActive] = useState(null);
  // Initial centre only; later moves are driven imperatively so re-renders don't snap the map back.
  const [initialCenter] = useState(center);
  const key = fitBounds ? shapeKey(markers, path) : `${center.lat},${center.lng},${zoom}`;

  useEffect(() => {
    if (!map || !window.google?.maps) return;
    const pts = allPoints(markers, path);
    if (fitBounds && pts.length > 1) {
      const bounds = new window.google.maps.LatLngBounds();
      pts.forEach(([lat, lng]) => bounds.extend({ lat, lng }));
      map.fitBounds(bounds, 48);
      const listener = window.google.maps.event.addListenerOnce(map, 'idle', () => {
        if (map.getZoom() > 15) map.setZoom(15);
      });
      return () => window.google.maps.event.removeListener(listener);
    }
    if (fitBounds && pts.length === 1) {
      map.panTo({ lat: pts[0][0], lng: pts[0][1] });
      map.setZoom(Math.max(zoom, 14));
    } else {
      map.panTo(center);
      map.setZoom(zoom);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key]);

  const gPath = useMemo(() => path.map(([lat, lng]) => ({ lat, lng })), [path]);
  const lineOptions = useMemo(
    () =>
      dashed
        ? {
            strokeOpacity: 0,
            icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.9, strokeColor: polylineColor, scale: 3 }, offset: '0', repeat: '14px' }],
          }
        : { strokeColor: polylineColor, strokeOpacity: 0.85, strokeWeight: 5 },
    [dashed, polylineColor],
  );

  return (
    <GoogleMap
      mapContainerStyle={{ width: '100%', height: '100%' }}
      center={initialCenter}
      zoom={zoom}
      onLoad={setMap}
      onUnmount={() => setMap(null)}
      options={MAP_OPTIONS}
    >
      {gPath.length > 1 ? <PolylineF path={gPath} options={lineOptions} /> : null}
      {markers.map((m) => (
        <MarkerF
          key={m.id}
          position={{ lat: m.lat, lng: m.lng }}
          title={m.label || m.type}
          zIndex={m.type === 'volunteer' ? 1000 : undefined}
          icon={{
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: m.type === 'volunteer' || m.big ? 10 : 7.5,
            fillColor: m.color,
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 3,
          }}
          onClick={() => {
            setActive(m);
            onMarkerClick?.(m);
          }}
        />
      ))}
      {active ? (
        <InfoWindowF position={{ lat: active.lat, lng: active.lng }} onCloseClick={() => setActive(null)}>
          <div className="text-xs">
            <div className="font-semibold text-dark">{active.label || active.type}</div>
            {active.description ? <div className="text-slate-600">{active.description}</div> : null}
          </div>
        </InfoWindowF>
      ) : null}
    </GoogleMap>
  );
}
