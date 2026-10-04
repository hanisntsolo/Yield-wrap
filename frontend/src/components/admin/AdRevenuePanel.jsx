import AnalyticsChart from '../AnalyticsChart';
import SectionCard from '../common/SectionCard';
import StatCard from '../common/StatCard';
import EmptyState from '../common/EmptyState';
import ErrorState from '../common/ErrorState';
import { SkeletonRows } from '../common/Skeleton';
import { Credits } from '../ads/AdBadges';
import { CHART_COLORS } from '../../utils/constants';
import { formatINR, formatNumber } from '../../utils/formatters';

const TYPE_ROWS = [
  { key: 'packet', label: 'Packet stickers', color: CHART_COLORS[0] },
  { key: 'ngo_poster', label: 'NGO posters', color: CHART_COLORS[2] },
  { key: 'digital', label: 'Digital', color: CHART_COLORS[1] },
];

/** Ad revenue KPIs + spend-by-type pie + top advertisers (GET /api/admin/ad-revenue). */
export default function AdRevenuePanel({ query }) {
  const d = query?.data || {};
  const loading = query?.loading;
  if (query?.error && !query?.data) return <ErrorState error={query.error} onRetry={query.reload} />;
  const byType = d.credits_spent_by_type || {};
  const pie = TYPE_ROWS.map((t) => ({ label: t.label, key: t.key, credits: Number(byType[t.key]) || 0 })).filter((r) => r.credits > 0);
  const top = Array.isArray(d.top_advertisers) ? d.top_advertisers : [];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Revenue" value={formatINR(d.revenue_inr)} hint={`${formatNumber(d.orders_paid)} paid orders`} icon="zap" loading={loading} />
        <StatCard label="Credits sold" value={formatNumber(d.credits_sold)} hint={`${formatNumber(d.credits_refunded)} refunded`} icon="package" tone="blue" loading={loading} />
        <StatCard label="NGO earnings" value={formatNumber(d.ngo_earnings_credits)} unit="cr" icon="heart" tone="accent" loading={loading} />
        <StatCard label="Active campaigns" value={formatNumber(d.active_campaigns)} hint={`${formatNumber(d.pending_creatives)} creatives pending`} icon="megaphone" tone="purple" loading={loading} />
        <StatCard label="Packets stickered" value={formatNumber(d.packets_stickered)} hint={`${formatNumber(d.packets_own)} own · ${formatNumber(d.packets_sponsored)} sponsored`} icon="check-circle" loading={loading} />
        <StatCard label="QR scans" value={formatNumber(d.scans)} icon="target" tone="slate" loading={loading} />
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard title="Credits spent by type" subtitle="Net of refunds where reported" icon="chart" bodyClassName="card-pad">
          <AnalyticsChart
            type="pie"
            data={pie}
            xKey="label"
            loading={loading}
            series={[{ key: 'credits', label: 'Credits' }]}
            valueFormatter={(v) => `${formatNumber(v)} cr`}
            colorFor={(row) => TYPE_ROWS.find((t) => t.key === row.key)?.color}
            emptyMessage="No credits spent yet"
            xLabel="Type"
          />
        </SectionCard>
        <SectionCard title="Top advertisers" subtitle="By credits spent" icon="trophy">
          {loading ? (
            <SkeletonRows rows={4} />
          ) : !top.length ? (
            <EmptyState compact icon="users" title="No advertisers yet" />
          ) : (
            <ol className="divide-y divide-slate-100">
              {top.map((a, i) => (
                <li key={a.owner_id || i} className="flex items-center gap-3 px-4 py-3 text-sm sm:px-6">
                  <span className="w-6 font-mono text-xs text-slate-400">#{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate font-medium text-dark">{a.owner_name || 'Unknown'}</span>
                  <Credits value={a.credits_spent} />
                </li>
              ))}
            </ol>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
