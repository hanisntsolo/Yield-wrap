import StatCard from '../common/StatCard';
import ErrorState from '../common/ErrorState';
import { formatDuration, formatKg, formatNumber } from '../../utils/formatters';

/** Headline KPIs from GET /api/analytics/dashboard. */
export default function KpiGrid({ data, loading, error, onRetry }) {
  if (error && !data) {
    return (
      <div className="card">
        <ErrorState error={error} onRetry={onRetry} compact title="KPIs unavailable" />
      </div>
    );
  }
  const d = data || {};
  const cards = [
    { label: 'Donations today', value: formatNumber(d.donations_today), icon: 'package' },
    { label: 'Redistributed today', value: formatKg(d.kg_redistributed_today), icon: 'leaf', tone: 'blue', hint: `${formatKg(d.kg_redistributed_total)} all-time` },
    { label: 'Active volunteers', value: formatNumber(d.active_volunteers), icon: 'users', tone: 'purple' },
    { label: 'Pending matches', value: formatNumber(d.pending_matches), icon: 'sparkles', tone: Number(d.pending_matches) > 10 ? 'critical' : 'accent' },
    { label: 'In transit', value: formatNumber(d.in_transit), icon: 'truck', tone: 'purple' },
    { label: 'Meals served', value: formatNumber(d.meals_served_estimate, { compact: true }), icon: 'utensils', tone: 'accent' },
    { label: 'Avg delivery time', value: formatDuration(d.avg_delivery_time_min), icon: 'clock', tone: 'slate' },
    { label: 'Total redistributed', value: formatKg(d.kg_redistributed_total), icon: 'chart' },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {cards.map((c) => (
        <StatCard key={c.label} {...c} loading={loading && !data} />
      ))}
    </div>
  );
}
