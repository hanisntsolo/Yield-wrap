import { useEffect, useMemo, useState } from 'react';
import MapView from '../MapView';
import MapLegend from '../map/MapLegend';
import Icon from '../common/Icon';
import StageProgress from '../common/StageProgress';
import StatusBadge from '../common/StatusBadge';
import ErrorState from '../common/ErrorState';
import Skeleton from '../common/Skeleton';
import useFetch from '../../hooks/useFetch';
import useVolunteerSocket from '../../hooks/useVolunteerSocket';
import { donorApi } from '../../services/api';
import { MARKER_COLORS, VEHICLE_LABELS } from '../../utils/constants';
import { formatEta, formatEtaClock, formatRelativeTime, summarizeItems } from '../../utils/formatters';
import { toLatLng } from '../../utils/geo';

/**
 * Live tracking of one donation: pickup, delivery and the volunteer's live marker.
 * WebSocket for real-time position; `/track` is polled for ETA and as fallback (faster when the socket is down).
 */
export default function LiveTracking({ donation, onEta, onClose }) {
  const id = donation?.id;
  // Prefer the donation's assigned volunteer (profile id); fall back to the id reported by /track.
  const [trackVolunteerId, setTrackVolunteerId] = useState(null);
  const socketVolunteerId = donation?.assigned_volunteer_id || trackVolunteerId;
  const live = useVolunteerSocket(socketVolunteerId, {
    enabled: Boolean(socketVolunteerId) && donation?.status !== 'delivered',
  });
  const { data: track, loading, error, reload } = useFetch(() => donorApi.track(id), [id], {
    enabled: Boolean(id),
    pollMs: live.connected ? 30000 : 10000,
  });

  useEffect(() => {
    if (!track) return;
    if (track.volunteer?.id) setTrackVolunteerId(track.volunteer.id);
    if (onEta) onEta(id, track.eta_minutes ?? null);
  }, [track, id]); // eslint-disable-line react-hooks/exhaustive-deps

  const status = track?.status || donation?.status;
  const stage = track?.task_stage || donation?.task_stage;
  const pickup = toLatLng(track?.pickup_location || donation?.pickup_location);
  const delivery = toLatLng(track?.delivery_location || donation?.delivery_location);
  const volunteer = track?.volunteer || null;
  const volunteerPos = toLatLng(live.position) || toLatLng(volunteer?.location);
  const lastSeen = live.position?.timestamp || volunteer?.location?.updated_at || volunteer?.location?.timestamp;

  const markers = useMemo(() => {
    const list = [];
    if (pickup) list.push({ id: 'pickup', type: 'pickup', ...pickup, label: 'Pickup', description: donation?.pickup_location?.address, shortLabel: 'Pickup' });
    if (delivery) list.push({ id: 'delivery', type: 'delivery', ...delivery, label: donation?.matched_ngo_name || 'Delivery', description: 'Delivery point', shortLabel: 'NGO' });
    if (volunteerPos && status !== 'delivered') {
      list.push({ id: 'volunteer', type: 'volunteer', ...volunteerPos, label: volunteer?.name || donation?.assigned_volunteer_name || 'Volunteer', description: 'Live position' });
    }
    return list;
  }, [pickup?.lat, pickup?.lng, delivery?.lat, delivery?.lng, volunteerPos?.lat, volunteerPos?.lng, status]); // eslint-disable-line react-hooks/exhaustive-deps

  const polyline = useMemo(() => {
    const pts = [];
    const pickedUp = stage === 'picked_up' || status === 'in_transit';
    if (volunteerPos && status !== 'delivered') pts.push([volunteerPos.lat, volunteerPos.lng]);
    if (pickup && !pickedUp) pts.push([pickup.lat, pickup.lng]);
    if (delivery) pts.push([delivery.lat, delivery.lng]);
    return pts;
  }, [volunteerPos?.lat, volunteerPos?.lng, pickup?.lat, delivery?.lat, stage, status]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!donation) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-dark">{summarizeItems(donation.food_items)}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <StatusBadge status={status} stage={stage} />
            <span
              className={`inline-flex items-center gap-1.5 text-xs font-medium ${live.connected ? 'text-primary' : 'text-slate-500'}`}
              title={live.connected ? 'Receiving live GPS updates' : 'Live link unavailable, refreshing periodically'}
            >
              <span className={`relative flex h-2 w-2 ${live.connected ? '' : 'opacity-60'}`}>
                {live.connected ? <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" /> : null}
                <span className={`relative inline-flex h-2 w-2 rounded-full ${live.connected ? 'bg-primary' : 'bg-slate-400'}`} />
              </span>
              {live.connected ? 'Live' : 'Updating every 10s'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">ETA</p>
            {loading ? (
              <Skeleton className="mt-1 h-7 w-20" />
            ) : (
              <p className="metric text-2xl text-primary">{status === 'delivered' ? 'Done' : formatEta(track?.eta_minutes)}</p>
            )}
            {track?.eta_minutes && status !== 'delivered' ? <p className="text-xs text-slate-500">by {formatEtaClock(track.eta_minutes)}</p> : null}
          </div>
          {onClose ? (
            <button type="button" className="btn-icon" onClick={onClose} aria-label="Stop tracking">
              <Icon name="x" />
            </button>
          ) : null}
        </div>
      </div>

      {error && !track ? (
        <ErrorState error={error} onRetry={reload} compact title="Tracking unavailable" />
      ) : (
        <>
          <MapView markers={markers} polyline={polyline} dashed height={340} emptyMessage="Waiting for location data" />
          <MapLegend
            items={[
              { color: MARKER_COLORS.pickup, label: 'Pickup' },
              { color: MARKER_COLORS.delivery, label: 'NGO delivery' },
              { color: MARKER_COLORS.volunteer, label: 'Volunteer (live)' },
            ]}
          />
        </>
      )}

      {stage ? (
        <div className="rounded-2xl bg-surface p-4">
          <StageProgress stage={stage} status={status} />
        </div>
      ) : (
        <p className="rounded-2xl bg-surface p-4 text-sm text-slate-600">
          {donation.ngo_accepted ? 'Allocating a volunteer…' : 'Waiting for the NGO to accept this donation.'}
        </p>
      )}

      {volunteer || donation.assigned_volunteer_name ? (
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 p-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EAF2FB] text-[#21618C]">
            <Icon name="truck" />
          </span>
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-semibold text-dark">{volunteer?.name || donation.assigned_volunteer_name}</p>
            <p className="text-xs text-slate-500">
              {VEHICLE_LABELS[volunteer?.vehicle_type] || 'Volunteer'}
              {lastSeen ? ` · position ${formatRelativeTime(lastSeen)}` : ''}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
