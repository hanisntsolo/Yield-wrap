import EmptyState from '../common/EmptyState';
import ErrorState from '../common/ErrorState';
import { SkeletonRows } from '../common/Skeleton';
import ProgressBar from '../common/ProgressBar';
import Countdown from '../common/Countdown';
import UrgencyBadge from '../common/UrgencyBadge';
import StatusBadge from '../common/StatusBadge';
import useFetch from '../../hooks/useFetch';
import { aiApi, asList } from '../../services/api';
import { POLL } from '../../utils/constants';
import { donationEarliestExpiry, donationTotalKg, formatKg, summarizeItems, toPercentScore } from '../../utils/formatters';

/** Pending / matched donations ranked by AI priority score. */
export default function PriorityQueue({ limit = 12 }) {
  const { data, loading, error, reload } = useFetch(() => aiApi.priorityQueue(), [], { pollMs: POLL.dashboard });
  const rows = asList(data, 'donations', 'queue').slice(0, limit);

  if (loading) return <SkeletonRows rows={5} />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} compact />;
  if (!rows.length) return <EmptyState icon="check-circle" title="Queue is clear" description="No pending or matched donations need attention." compact />;

  return (
    <ol className="divide-y divide-slate-100">
      {rows.map((d, i) => {
        const pct = toPercentScore(d.priority_score) ?? 0;
        return (
          <li key={d.id} className="flex items-start gap-3 px-4 py-3 sm:px-6">
            <span className="mt-0.5 w-6 shrink-0 font-mono text-sm font-bold text-slate-400">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="min-w-0 truncate text-sm font-semibold text-dark">{summarizeItems(d.food_items)}</p>
                <span className="font-mono text-sm font-bold text-dark">{formatKg(donationTotalKg(d))}</span>
              </div>
              <p className="truncate text-xs text-slate-500">
                {d.donor_name || 'Donor'}
                {d.matched_ngo_name ? ` → ${d.matched_ngo_name}` : ''}
              </p>
              <div className="mt-2 flex items-center gap-2">
                <ProgressBar value={pct} tone={pct >= 75 ? 'critical' : pct >= 50 ? 'accent' : 'primary'} className="flex-1" label="Priority score" />
                <span className="w-8 text-right font-mono text-xs font-bold text-dark">{Math.round(pct)}</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <UrgencyBadge level={d.urgency_level} />
                <StatusBadge status={d.status} />
                <Countdown target={donationEarliestExpiry(d)} />
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
