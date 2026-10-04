import Icon from '../common/Icon';
import Countdown from '../common/Countdown';
import UrgencyBadge from '../common/UrgencyBadge';
import Spinner from '../common/Spinner';
import PriorityBadge from './PriorityBadge';
import { donationEarliestExpiry, donationTotalKg, formatDistance, formatKg, summarizeItems } from '../../utils/formatters';
import { haversineKm } from '../../utils/geo';

/** A task offered to the volunteer (task_stage === 'assigned'), with Accept / Decline. */
export default function TaskCard({ task: t, myLocation, onAccept, onDecline, busy, disabled }) {
  const toPickup = haversineKm(myLocation, t.pickup_location);
  const trip = haversineKm(t.pickup_location, t.delivery_location);
  return (
    <article className="card animate-fade-up p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PriorityBadge score={t.priority_score} />
        <div className="flex items-center gap-2">
          <UrgencyBadge level={t.urgency_level} />
          <Countdown target={donationEarliestExpiry(t)} />
        </div>
      </div>
      <div className="mt-3 flex items-start justify-between gap-3">
        <h3 className="min-w-0 text-base font-semibold text-dark">{summarizeItems(t.food_items)}</h3>
        <span className="metric shrink-0 text-lg text-dark">{formatKg(donationTotalKg(t))}</span>
      </div>

      <ol className="mt-3 space-y-2 text-sm">
        <li className="flex items-start gap-2.5">
          <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-accent ring-4 ring-accent/20" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500">
              Pickup · {t.donor_name || 'Donor'}
              {toPickup !== null ? <span className="font-mono"> · {formatDistance(toPickup)} from you</span> : null}
            </p>
            <p className="line-clamp-2 text-slate-700">{t.pickup_location?.address || '—'}</p>
          </div>
        </li>
        <li className="flex items-start gap-2.5">
          <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-primary ring-4 ring-primary/20" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500">
              Deliver to · {t.matched_ngo_name || 'NGO'}
              {trip !== null ? <span className="font-mono"> · {formatDistance(trip)} trip</span> : null}
            </p>
            <p className="line-clamp-2 text-slate-700">{t.delivery_location?.address || '—'}</p>
          </div>
        </li>
      </ol>

      <div className="mt-4 flex gap-2">
        <button type="button" className="btn btn-primary flex-1" onClick={() => onAccept(t)} disabled={busy || disabled}>
          {busy ? <Spinner size={16} /> : <Icon name="check" size={16} />} Accept
        </button>
        <button type="button" className="btn btn-secondary flex-1" onClick={() => onDecline(t)} disabled={busy}>
          <Icon name="x" size={16} /> Decline
        </button>
      </div>
      {disabled ? <p className="mt-2 text-xs text-slate-500">Finish your active delivery before accepting another.</p> : null}
    </article>
  );
}
