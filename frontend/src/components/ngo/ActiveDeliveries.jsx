import { useCallback, useEffect, useMemo, useState } from 'react';
import MapView from '../MapView';
import MapLegend from '../map/MapLegend';
import StageProgress from '../common/StageProgress';
import StatusBadge from '../common/StatusBadge';
import EmptyState from '../common/EmptyState';
import ErrorState from '../common/ErrorState';
import { SkeletonRows } from '../common/Skeleton';
import Icon from '../common/Icon';
import useVolunteerSocket from '../../hooks/useVolunteerSocket';
import { asList } from '../../services/api';
import { MARKER_COLORS, VEHICLE_LABELS } from '../../utils/constants';
import { donationTotalKg, formatEta, formatKg, summarizeItems } from '../../utils/formatters';
import { toLatLng } from '../../utils/geo';

const MAX_LIVE = 10;

/** Volunteer location as reported on the /incoming payload (field name tolerant). */
export function reportedVolunteerLocation(d) {
  return (
    toLatLng(d?.volunteer_location) ||
    toLatLng(d?.volunteer?.location) ||
    toLatLng(d?.volunteer?.current_location) ||
    toLatLng(d?.assigned_volunteer_location) ||
    null
  );
}

/** Invisible subscriber that lifts a volunteer's live socket position to the parent. */
function LiveFeed({ volunteerId, onPosition }) {
  const { position } = useVolunteerSocket(volunteerId);
  useEffect(() => {
    if (position) onPosition(volunteerId, position);
  }, [position, volunteerId, onPosition]);
  return null;
}

export default function ActiveDeliveries({ query, ngoLocation, ngoName }) {
  const { data, loading, error, reload } = query;
  const deliveries = useMemo(() => asList(data, 'donations'), [data]);
  const [livePositions, setLivePositions] = useState({});
  const onPosition = useCallback((id, pos) => setLivePositions((p) => ({ ...p, [id]: pos })), []);

  const volunteerIds = useMemo(
    () => [...new Set(deliveries.map((d) => d.assigned_volunteer_id).filter(Boolean))].slice(0, MAX_LIVE),
    [deliveries],
  );

  const markers = useMemo(() => {
    const list = [];
    const home = toLatLng(ngoLocation);
    if (home) list.push({ id: 'ngo', type: 'ngo', ...home, label: ngoName || 'Your NGO', shortLabel: 'You', big: true });
    deliveries.forEach((d) => {
      const pickup = toLatLng(d.pickup_location);
      if (pickup && d.task_stage !== 'picked_up') {
        list.push({ id: `p-${d.id}`, type: 'pickup', ...pickup, label: summarizeItems(d.food_items), description: d.pickup_location?.address });
      }
      const pos = toLatLng(livePositions[d.assigned_volunteer_id]) || reportedVolunteerLocation(d);
      if (pos) {
        list.push({ id: `v-${d.id}`, type: 'volunteer', ...pos, label: d.assigned_volunteer_name || 'Volunteer', description: summarizeItems(d.food_items) });
      }
    });
    return list;
  }, [deliveries, livePositions, ngoLocation, ngoName]);

  if (loading) return <SkeletonRows rows={3} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  return (
    <div className="grid gap-5 p-4 sm:p-6 xl:grid-cols-5">
      {volunteerIds.map((id) => (
        <LiveFeed key={id} volunteerId={id} onPosition={onPosition} />
      ))}
      <div className="space-y-2 xl:col-span-3">
        <MapView markers={markers} height={340} emptyMessage="No active deliveries on the map" />
        <MapLegend
          items={[
            { color: MARKER_COLORS.ngo, label: 'Your NGO' },
            { color: MARKER_COLORS.pickup, label: 'Pickup' },
            { color: MARKER_COLORS.volunteer, label: 'Volunteer' },
          ]}
        />
      </div>
      <div className="xl:col-span-2">
        {deliveries.length === 0 ? (
          <EmptyState icon="truck" title="No deliveries in progress" description="Accepted donations appear here with live volunteer positions." compact />
        ) : (
          <ul className="space-y-3">
            {deliveries.map((d) => (
              <li key={d.id} className="rounded-2xl border border-slate-200 p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-dark">{summarizeItems(d.food_items)}</p>
                    <p className="truncate text-xs text-slate-500">from {d.donor_name || 'donor'}</p>
                  </div>
                  <span className="font-mono text-sm font-bold text-dark">{formatKg(donationTotalKg(d))}</span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <StatusBadge status={d.status} />
                  {d.assigned_volunteer_name ? (
                    <span className="inline-flex items-center gap-1">
                      <Icon name="truck" size={13} /> {d.assigned_volunteer_name}
                      {d.volunteer?.vehicle_type ? ` · ${VEHICLE_LABELS[d.volunteer.vehicle_type] || ''}` : ''}
                    </span>
                  ) : (
                    <span className="text-[#B9770E]">Finding a volunteer…</span>
                  )}
                  {d.eta_minutes !== undefined && d.eta_minutes !== null ? (
                    <span className="font-mono font-semibold text-primary">ETA {formatEta(d.eta_minutes)}</span>
                  ) : null}
                </div>
                {d.task_stage ? (
                  <div className="mt-3">
                    <StageProgress stage={d.task_stage} status={d.status} />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
