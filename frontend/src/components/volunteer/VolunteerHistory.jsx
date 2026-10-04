import EmptyState from '../common/EmptyState';
import ErrorState from '../common/ErrorState';
import { SkeletonRows } from '../common/Skeleton';
import { donationTotalKg, formatDateTime, formatKg, summarizeItems } from '../../utils/formatters';

/** Delivered tasks: table on desktop, stacked cards on mobile. */
export default function VolunteerHistory({ rows = [], loading, error, onRetry }) {
  if (loading) return <SkeletonRows rows={4} />;
  if (error) return <ErrorState error={error} onRetry={onRetry} compact />;
  if (!rows.length) return <EmptyState icon="calendar" title="No deliveries yet" description="Completed deliveries will show up here." compact />;
  const qty = (d) => formatKg(d.delivery_record?.quantity_confirmed_kg ?? donationTotalKg(d));
  const when = (d) => formatDateTime(d.delivered_at || d.delivery_record?.delivered_at);
  return (
    <>
      <ul className="divide-y divide-slate-100 md:hidden">
        {rows.map((d) => (
          <li key={d.id} className="px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 truncate text-sm font-semibold text-dark">{summarizeItems(d.food_items)}</p>
              <span className="font-mono text-sm font-bold text-dark">{qty(d)}</span>
            </div>
            <p className="mt-0.5 truncate text-xs text-slate-500">
              {d.donor_name || 'Donor'} → {d.matched_ngo_name || 'NGO'}
            </p>
            <p className="mt-0.5 text-xs text-slate-400">{when(d)}</p>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto md:block">
        <table className="table-base">
          <thead className="bg-slate-50/80">
            <tr>
              <th scope="col">Delivered</th>
              <th scope="col">Food</th>
              <th scope="col">Qty</th>
              <th scope="col">From</th>
              <th scope="col">To</th>
              <th scope="col">Received by</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((d) => (
              <tr key={d.id}>
                <td className="whitespace-nowrap text-xs">{when(d)}</td>
                <td className="max-w-[14rem] truncate font-medium text-dark">{summarizeItems(d.food_items)}</td>
                <td className="whitespace-nowrap font-mono">{qty(d)}</td>
                <td className="max-w-[10rem] truncate">{d.donor_name || '—'}</td>
                <td className="max-w-[10rem] truncate">{d.matched_ngo_name || '—'}</td>
                <td className="max-w-[10rem] truncate">{d.delivery_record?.receiver_name || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
