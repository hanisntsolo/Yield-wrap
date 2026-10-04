import { useState } from 'react';
import AnalyticsChart from '../AnalyticsChart';
import SectionCard from '../common/SectionCard';
import SegmentedControl from '../common/SegmentedControl';
import ErrorState from '../common/ErrorState';
import useFetch from '../../hooks/useFetch';
import { analyticsApi, asList } from '../../services/api';
import { CHART_COLORS, FOOD_CATEGORIES, FOOD_CATEGORY_LABELS } from '../../utils/constants';
import { formatKg, formatNumber, formatPercent } from '../../utils/formatters';

/** "2026-10-04" -> "Oct 4" in local time (date-only strings must not shift across time zones). */
const dayLabel = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return String(iso ?? '');
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

// Colour follows the food category, not its rank.
const CATEGORY_COLOR = Object.fromEntries(FOOD_CATEGORIES.map((c, i) => [c.value, CHART_COLORS[i % CHART_COLORS.length]]));
const utilColor = (row) => (row.utilization_pct >= 90 ? '#E74C3C' : row.utilization_pct >= 70 ? '#F39C12' : '#1A7A4A');

function ChartCard({ title, subtitle, icon, actions, query, className = '', children }) {
  return (
    <SectionCard title={title} subtitle={subtitle} icon={icon} actions={actions} className={className} bodyClassName="card-pad">
      {query.error && !query.data ? <ErrorState error={query.error} onRetry={query.reload} compact /> : children}
    </SectionCard>
  );
}

export default function ChartsSection() {
  const [period, setPeriod] = useState('daily');
  const [metric, setMetric] = useState('kg');
  const trendQ = useFetch(() => analyticsApi.trend(period, 30), [period], { pollMs: 120000 });
  const foodQ = useFetch(() => analyticsApi.foodTypes(), [], { pollMs: 300000 });
  const ngoQ = useFetch(() => analyticsApi.ngoUtilization(), [], { pollMs: 120000 });
  const volQ = useFetch(() => analyticsApi.volunteerPerformance(10), [], { pollMs: 300000 });

  const trend = asList(trendQ.data, 'trend');
  const food = asList(foodQ.data, 'food_types').map((r) => ({ ...r, label: FOOD_CATEGORY_LABELS[r.category] || r.category, kg: Number(r.kg) || 0 }));
  const ngos = asList(ngoQ.data).slice(0, 10).map((r) => ({ ...r, utilization_pct: Number(r.utilization_pct) || 0 }));
  const vols = asList(volQ.data).map((r) => ({ ...r, completed_deliveries: Number(r.completed_deliveries) || 0 }));

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <ChartCard
        className="xl:col-span-2"
        title="Donation trend"
        subtitle="Last 30 days"
        icon="chart"
        query={trendQ}
        actions={
          <>
            <SegmentedControl size="sm" ariaLabel="Metric" value={metric} onChange={setMetric} options={[{ value: 'kg', label: 'Kg' }, { value: 'donations', label: 'Count' }]} />
            <SegmentedControl size="sm" ariaLabel="Period" value={period} onChange={setPeriod} options={[{ value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }]} />
          </>
        }
      >
        <AnalyticsChart
          type="line"
          data={trend}
          xKey="date"
          loading={trendQ.loading}
          series={[metric === 'kg' ? { key: 'kg', label: 'Food (kg)' } : { key: 'donations', label: 'Donations', color: CHART_COLORS[1] }]}
          valueFormatter={metric === 'kg' ? (v) => formatKg(v) : (v) => formatNumber(v)}
          xTickFormatter={dayLabel}
          xLabel={period === 'weekly' ? 'Week of' : 'Date'}
        />
      </ChartCard>

      <ChartCard title="Food types" subtitle="Share of all donated kg" icon="utensils" query={foodQ}>
        <AnalyticsChart
          type="pie"
          data={food}
          xKey="label"
          loading={foodQ.loading}
          series={[{ key: 'kg', label: 'Food (kg)' }]}
          valueFormatter={(v) => formatKg(v)}
          colorFor={(row) => CATEGORY_COLOR[row.category]}
          xLabel="Category"
        />
      </ChartCard>

      <ChartCard title="NGO utilisation" subtitle="Current storage load (top 10)" icon="gauge" query={ngoQ}>
        <AnalyticsChart
          type="bar"
          data={ngos}
          xKey="organization_name"
          loading={ngoQ.loading}
          series={[{ key: 'utilization_pct', label: 'Utilisation' }]}
          valueFormatter={(v) => formatPercent(v, { fraction: false })}
          xTickFormatter={(v) => (String(v).length > 12 ? `${String(v).slice(0, 11)}…` : v)}
          colorFor={utilColor}
          xLabel="NGO"
        />
      </ChartCard>

      <ChartCard className="xl:col-span-2" title="Volunteer performance" subtitle="Completed deliveries (top 10)" icon="trophy" query={volQ}>
        <AnalyticsChart
          type="hbar"
          data={vols}
          xKey="name"
          loading={volQ.loading}
          height={Math.max(220, vols.length * 34)}
          series={[{ key: 'completed_deliveries', label: 'Deliveries', color: CHART_COLORS[1] }]}
          valueFormatter={(v) => formatNumber(v)}
          xLabel="Volunteer"
        />
      </ChartCard>
    </div>
  );
}
