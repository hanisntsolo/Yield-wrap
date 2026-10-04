import { useMemo } from 'react';
import MapView from '../MapView';
import MapLegend from '../map/MapLegend';
import ErrorState from '../common/ErrorState';
import Skeleton from '../common/Skeleton';
import useFetch from '../../hooks/useFetch';
import { adminApi, asList } from '../../services/api';
import { DONATION_STATUSES, MARKER_COLORS, POLL, VEHICLE_LABELS } from '../../utils/constants';
import { donationTotalKg, formatKg, formatPercent, summarizeItems } from '../../utils/formatters';

const ngoColor = (pct) => (pct >= 90 ? '#E74C3C' : pct >= 70 ? '#E67E22' : MARKER_COLORS.ngo);

/** System-wide map: open donations (by status), volunteers and NGOs (with load %). */
export default function LiveMap({ height = 460 }) {
  const { data, loading, error, reload } = useFetch(() => adminApi.map(), [], { pollMs: POLL.adminMap });
  const donations = asList(data?.donations);
  const volunteers = asList(data?.volunteers);
  const ngos = asList(data?.ngos);

  const markers = useMemo(
    () => [
      ...ngos.map((n) => {
        const pct = Number(n.load_pct) || 0;
        return {
          id: `ngo-${n.id}`,
          type: 'ngo',
          ...(n.location || {}),
          color: ngoColor(pct),
          label: n.organization_name || 'NGO',
          description: `Storage load ${formatPercent(pct, { fraction: false })}${n.is_verified === false ? ' · unverified' : ''}`,
          shortLabel: `${Math.round(pct)}%`,
        };
      }),
      ...donations.map((d) => ({
        id: `don-${d.id}`,
        type: 'donation',
        ...(d.pickup_location || {}),
        color: DONATION_STATUSES[d.status]?.hex,
        label: summarizeItems(d.food_items),
        description: `${DONATION_STATUSES[d.status]?.label || d.status} · ${formatKg(donationTotalKg(d))} · ${d.donor_name || 'Donor'}`,
      })),
      ...volunteers.map((v) => ({
        id: `vol-${v.id}`,
        type: 'volunteer',
        ...(v.location || {}),
        color: v.availability ? MARKER_COLORS.volunteer : '#95A5A6',
        pulse: Boolean(v.active_task_id),
        label: v.name || 'Volunteer',
        description: `${VEHICLE_LABELS[v.vehicle_type] || 'Volunteer'} · ${v.active_task_id ? 'on a delivery' : v.availability ? 'available' : 'offline'}`,
      })),
    ],
    [data], // eslint-disable-line react-hooks/exhaustive-deps
  );

  if (loading && !data) return <Skeleton className="w-full rounded-2xl" style={{ height }} />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} compact title="Map unavailable" />;

  return (
    <div className="space-y-3">
      <MapView markers={markers} height={height} zoom={11} emptyMessage="No active donations, volunteers or NGOs yet" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <MapLegend
          items={[
            { color: DONATION_STATUSES.pending.hex, label: 'Pending' },
            { color: DONATION_STATUSES.matched.hex, label: 'Matched' },
            { color: DONATION_STATUSES.in_transit.hex, label: 'In transit' },
            { color: MARKER_COLORS.volunteer, label: 'Volunteer' },
            { color: MARKER_COLORS.ngo, label: 'NGO (<70% full)' },
            { color: '#E74C3C', label: 'NGO (≥90% full)' },
          ]}
        />
        <p className="font-mono text-xs text-slate-500">
          {donations.length} donations · {volunteers.length} volunteers · {ngos.length} NGOs
        </p>
      </div>
    </div>
  );
}
