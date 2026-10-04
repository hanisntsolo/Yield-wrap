import StatCard from '../common/StatCard';
import { formatNumber } from '../../utils/formatters';

export default function MyStats({ profile, loading, monthDeliveries }) {
  const rating = profile?.rating;
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
      <StatCard label="Deliveries" value={formatNumber(profile?.completed_deliveries ?? 0)} icon="truck" loading={loading} />
      <StatCard label="This month" value={formatNumber(monthDeliveries ?? 0)} icon="calendar" tone="blue" loading={loading} />
      <StatCard
        label="Rating"
        value={rating !== undefined && rating !== null ? Number(rating).toFixed(1) : '—'}
        unit={rating !== undefined && rating !== null ? '/ 5' : undefined}
        icon="star"
        tone="accent"
        loading={loading}
      />
      <StatCard label="Hours given" value={formatNumber(profile?.hours_contributed ?? 0, { decimals: 1 })} unit="h" icon="clock" tone="purple" loading={loading} />
    </div>
  );
}
