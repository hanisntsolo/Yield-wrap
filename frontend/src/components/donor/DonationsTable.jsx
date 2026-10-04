import Icon from '../common/Icon';
import StatusBadge from '../common/StatusBadge';
import UrgencyBadge from '../common/UrgencyBadge';
import Countdown from '../common/Countdown';
import EmptyState from '../common/EmptyState';
import ErrorState from '../common/ErrorState';
import { SkeletonRows } from '../common/Skeleton';
import { PartnerName } from '../common/VerifiedBadge';
import {
  donationEarliestExpiry,
  donationTotalKg,
  formatEta,
  formatKg,
  formatRelativeTime,
  summarizeItems,
} from '../../utils/formatters';

export const canEditDonation = (d) => d?.status === 'pending';
export const canCancelDonation = (d) =>
  ['pending', 'matched'].includes(d?.status) && !['picked_up', 'delivered'].includes(d?.task_stage);
export const canTrackDonation = (d) => ['matched', 'in_transit'].includes(d?.status);

function EtaCell({ d, eta }) {
  if (d.status === 'delivered') {
    return <span className="text-xs text-slate-500">Delivered {formatRelativeTime(d.delivered_at)}</span>;
  }
  if (canTrackDonation(d) && eta !== undefined && eta !== null) {
    return <span className="font-mono text-sm font-semibold text-dark">{formatEta(eta)}</span>;
  }
  if (d.status === 'pending' || (d.status === 'matched' && !d.task_stage)) {
    return <Countdown target={donationEarliestExpiry(d)} prefix="Expires" />;
  }
  return <span className="text-slate-400">—</span>;
}

function NgoCell({ d }) {
  if (!d.matched_ngo_name) return <span className="text-slate-400">—</span>;
  return (
    <div className="min-w-0">
      <PartnerName name={d.matched_ngo_name} ids={[d.matched_ngo_id]} className="text-sm font-medium text-dark" />
      {d.status === 'matched' && !d.ngo_accepted ? <p className="text-xs text-[#B9770E]">Awaiting NGO acceptance</p> : null}
      {d.assigned_volunteer_name ? <p className="truncate text-xs text-slate-500">Volunteer: {d.assigned_volunteer_name}</p> : null}
    </div>
  );
}

function Actions({ d, onTrack, onView, onEdit, onCancel, selected }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {canTrackDonation(d) ? (
        <button
          type="button"
          className={`btn btn-sm ${selected ? 'btn-primary' : 'btn-outline-primary'}`}
          onClick={() => onTrack(d)}
          aria-pressed={selected}
        >
          <Icon name="navigation" size={13} /> Track
        </button>
      ) : null}
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => onView(d)} aria-label={`View ${summarizeItems(d.food_items)}`}>
        <Icon name="eye" size={13} /> View
      </button>
      {canEditDonation(d) ? (
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onEdit(d)}>
          <Icon name="edit" size={13} /> Edit
        </button>
      ) : null}
      {canCancelDonation(d) ? (
        <button type="button" className="btn btn-ghost btn-sm text-critical hover:bg-critical-light hover:text-critical" onClick={() => onCancel(d)}>
          <Icon name="x-circle" size={13} /> Cancel
        </button>
      ) : null}
    </div>
  );
}

export default function DonationsTable({ donations, loading, error, onReload, etas = {}, selectedId, ...handlers }) {
  if (loading) return <SkeletonRows rows={4} />;
  if (error) return <ErrorState error={error} onRetry={onReload} />;
  if (!donations?.length) {
    return (
      <EmptyState
        icon="package"
        title="No donations yet"
        description="List your first surplus food above — our AI will find the best NGO for it in seconds."
      />
    );
  }

  return (
    <>
      {/* Desktop / tablet table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="table-base">
          <thead className="bg-slate-50/80">
            <tr>
              <th scope="col">Food</th>
              <th scope="col">Qty</th>
              <th scope="col">Status</th>
              <th scope="col">NGO matched</th>
              <th scope="col">ETA</th>
              <th scope="col" className="text-right">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {donations.map((d) => (
              <tr key={d.id} className={selectedId === d.id ? 'bg-primary-light/40' : ''}>
                <td className="max-w-[16rem]">
                  <p className="truncate font-medium text-dark">{summarizeItems(d.food_items)}</p>
                  <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                    <UrgencyBadge level={d.urgency_level} />
                    <span>{formatRelativeTime(d.created_at)}</span>
                  </div>
                </td>
                <td className="whitespace-nowrap font-mono font-semibold text-dark">{formatKg(donationTotalKg(d))}</td>
                <td>
                  <StatusBadge status={d.status} stage={d.task_stage} />
                </td>
                <td className="max-w-[14rem]">
                  <NgoCell d={d} />
                </td>
                <td className="whitespace-nowrap">
                  <EtaCell d={d} eta={etas[d.id]} />
                </td>
                <td>
                  <Actions d={d} selected={selectedId === d.id} {...handlers} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <ul className="divide-y divide-slate-100 md:hidden">
        {donations.map((d) => (
          <li key={d.id} className={`space-y-3 p-4 ${selectedId === d.id ? 'bg-primary-light/40' : ''}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold text-dark">{summarizeItems(d.food_items)}</p>
                <p className="text-xs text-slate-500">{formatRelativeTime(d.created_at)}</p>
              </div>
              <span className="font-mono text-sm font-bold text-dark">{formatKg(donationTotalKg(d))}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={d.status} stage={d.task_stage} />
              <UrgencyBadge level={d.urgency_level} />
              <EtaCell d={d} eta={etas[d.id]} />
            </div>
            {d.matched_ngo_name ? (
              <div className="flex items-center gap-2 text-sm">
                <Icon name="building" size={15} className="text-slate-400" />
                <NgoCell d={d} />
              </div>
            ) : null}
            <Actions d={d} selected={selectedId === d.id} {...handlers} />
          </li>
        ))}
      </ul>
    </>
  );
}
