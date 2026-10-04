import Icon from '../common/Icon';
import Skeleton from '../common/Skeleton';
import ErrorState from '../common/ErrorState';
import useFetch from '../../hooks/useFetch';
import { analyticsApi } from '../../services/api';
import { formatKg, formatNumber } from '../../utils/formatters';

const ITEMS = [
  { key: 'kg_saved', label: 'Food saved', icon: 'package', fmt: (v) => formatKg(v), tone: 'bg-primary-light text-primary' },
  { key: 'meals_served', label: 'Meals served', icon: 'utensils', fmt: (v) => formatNumber(v, { compact: true }), tone: 'bg-accent-light text-[#B9770E]' },
  { key: 'co2_saved_kg', label: 'CO₂ avoided', icon: 'cloud', fmt: (v) => formatKg(v), tone: 'bg-[#F4ECF7] text-[#76448A]' },
  { key: 'water_saved_liters', label: 'Water saved', icon: 'droplet', fmt: (v) => `${formatNumber(v, { compact: true })} L`, tone: 'bg-[#EAF2FB] text-[#21618C]' },
];

/** Environmental impact from GET /api/analytics/waste-saved. */
export default function ImpactPanel() {
  const { data, loading, error, reload } = useFetch(() => analyticsApi.wasteSaved(), [], { pollMs: 120000 });
  if (error && !data) return <ErrorState error={error} onRetry={reload} compact />;
  return (
    <ul className="grid grid-cols-2 gap-3">
      {ITEMS.map((it) => (
        <li key={it.key} className="rounded-2xl bg-surface p-3">
          <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${it.tone}`}>
            <Icon name={it.icon} size={16} />
          </span>
          {loading && !data ? <Skeleton className="mt-2 h-6 w-16" /> : <p className="metric mt-2 text-lg text-dark">{it.fmt(data?.[it.key])}</p>}
          <p className="text-xs text-slate-500">{it.label}</p>
        </li>
      ))}
    </ul>
  );
}
