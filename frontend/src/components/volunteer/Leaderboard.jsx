import EmptyState from '../common/EmptyState';
import ErrorState from '../common/ErrorState';
import { SkeletonRows } from '../common/Skeleton';
import Icon from '../common/Icon';
import { VEHICLE_LABELS } from '../../utils/constants';
import { formatNumber } from '../../utils/formatters';

const MEDALS = ['text-[#D4A017]', 'text-slate-400', 'text-[#B87333]'];

export default function Leaderboard({ rows = [], loading, error, onRetry, selfId, limit = 10 }) {
  if (loading) return <SkeletonRows rows={5} />;
  if (error) return <ErrorState error={error} onRetry={onRetry} compact />;
  if (!rows.length) return <EmptyState icon="trophy" title="No deliveries this month yet" description="Be the first on the board!" compact />;
  return (
    <ol className="divide-y divide-slate-100">
      {rows.slice(0, limit).map((r, i) => {
        const me = selfId && String(r.volunteer_id) === String(selfId);
        return (
          <li key={r.volunteer_id || i} className={`flex items-center gap-3 px-4 py-3 sm:px-6 ${me ? 'bg-primary-light/60' : ''}`}>
            <span className="flex w-7 shrink-0 justify-center font-mono text-sm font-bold text-slate-500">
              {i < 3 ? <Icon name="trophy" size={20} className={MEDALS[i]} title={`Rank ${i + 1}`} /> : i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-dark">
                {r.name || 'Volunteer'} {me ? <span className="text-xs font-medium text-primary">(you)</span> : null}
              </p>
              <p className="flex items-center gap-1 truncate text-xs text-slate-500">
                {VEHICLE_LABELS[r.vehicle_type] || 'Volunteer'} · {formatNumber(r.completed_deliveries)} all-time ·
                <span className="inline-flex items-center gap-0.5 font-mono font-semibold text-[#B9770E]">
                  <Icon name="star" size={12} /> {r.rating !== undefined && r.rating !== null ? Number(r.rating).toFixed(1) : '—'}
                </span>
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="font-mono text-sm font-bold text-dark">{formatNumber(r.deliveries_this_month)}</p>
              <p className="text-[11px] text-slate-500">this mo.</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
