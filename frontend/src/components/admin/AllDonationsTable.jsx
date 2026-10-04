import { useState } from 'react';
import EmptyState from '../common/EmptyState';
import ErrorState from '../common/ErrorState';
import Icon from '../common/Icon';
import StatusBadge from '../common/StatusBadge';
import UrgencyBadge from '../common/UrgencyBadge';
import { SkeletonRows } from '../common/Skeleton';
import DonationDetails from '../donor/DonationDetails';
import useFetch from '../../hooks/useFetch';
import { adminApi, asList } from '../../services/api';
import { STATUS_OPTIONS } from '../../utils/constants';
import { donationTotalKg, formatDateTime, formatKg, summarizeItems } from '../../utils/formatters';

/** Every donation on the platform with a status filter (GET /api/admin/donations?status=). */
export default function AllDonationsTable() {
  const [status, setStatus] = useState('');
  const [viewing, setViewing] = useState(null);
  const { data, loading, error, reload } = useFetch(() => adminApi.donations(status), [status], { pollMs: 30000 });
  const rows = asList(data, 'donations');

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4 sm:px-6">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <Icon name="filter" size={16} />
          <span className="sr-only sm:not-sr-only">Status</span>
          <select className="input w-auto py-1.5 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <span className="font-mono text-xs text-slate-500">{rows.length} donations</span>
      </div>

      {loading ? (
        <SkeletonRows rows={6} />
      ) : error && !data ? (
        <ErrorState error={error} onRetry={reload} />
      ) : !rows.length ? (
        <EmptyState icon="package" title="No donations" description={status ? 'Nothing with this status right now.' : 'Donations will appear here once donors list surplus.'} />
      ) : (
        <>
          <ul className="divide-y divide-slate-100 md:hidden">
            {rows.map((d) => (
              <li key={d.id}>
                <button type="button" className="w-full px-4 py-3 text-left hover:bg-slate-50" onClick={() => setViewing(d)}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 truncate text-sm font-semibold text-dark">{summarizeItems(d.food_items)}</p>
                    <span className="font-mono text-sm font-bold">{formatKg(donationTotalKg(d))}</span>
                  </div>
                  <p className="truncate text-xs text-slate-500">
                    {d.donor_name || 'Donor'} → {d.matched_ngo_name || 'unmatched'}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <StatusBadge status={d.status} stage={d.task_stage} />
                    <UrgencyBadge level={d.urgency_level} />
                    <span className="text-[11px] text-slate-400">{formatDateTime(d.created_at)}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <table className="table-base">
              <thead className="bg-slate-50/80">
                <tr>
                  <th scope="col">Created</th>
                  <th scope="col">Food</th>
                  <th scope="col">Qty</th>
                  <th scope="col">Donor</th>
                  <th scope="col">NGO</th>
                  <th scope="col">Volunteer</th>
                  <th scope="col">Status</th>
                  <th scope="col">Urgency</th>
                  <th scope="col">
                    <span className="sr-only">View</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((d) => (
                  <tr key={d.id}>
                    <td className="whitespace-nowrap text-xs">{formatDateTime(d.created_at)}</td>
                    <td className="max-w-[12rem] truncate font-medium text-dark">{summarizeItems(d.food_items)}</td>
                    <td className="whitespace-nowrap font-mono">{formatKg(donationTotalKg(d))}</td>
                    <td className="max-w-[9rem] truncate">{d.donor_name || '—'}</td>
                    <td className="max-w-[9rem] truncate">{d.matched_ngo_name || '—'}</td>
                    <td className="max-w-[9rem] truncate">{d.assigned_volunteer_name || '—'}</td>
                    <td>
                      <StatusBadge status={d.status} stage={d.task_stage} />
                    </td>
                    <td>
                      <UrgencyBadge level={d.urgency_level} />
                    </td>
                    <td>
                      <button type="button" className="btn-icon h-8 w-8" onClick={() => setViewing(d)} aria-label="View details">
                        <Icon name="eye" size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <DonationDetails donation={viewing} open={Boolean(viewing)} onClose={() => setViewing(null)} />
    </div>
  );
}
