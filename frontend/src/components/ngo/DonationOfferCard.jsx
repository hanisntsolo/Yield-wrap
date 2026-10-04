import Icon from '../common/Icon';
import Countdown from '../common/Countdown';
import ScoreBadge from '../common/ScoreBadge';
import UrgencyBadge from '../common/UrgencyBadge';
import Spinner from '../common/Spinner';
import { FOOD_CATEGORY_LABELS } from '../../utils/constants';
import { donationCategories, donationEarliestExpiry, donationTotalKg, formatDistance, formatKg, summarizeItems } from '../../utils/formatters';
import { haversineKm } from '../../utils/geo';

export default function DonationOfferCard({ donation: d, ngoLocation, onAccept, onDecline, busy }) {
  const isOffer = d.offer_type === 'offer';
  const categories = donationCategories(d);
  const allergens = [...new Set((d.food_items || []).flatMap((it) => it?.allergens || []))];
  const distance = d.distance_km ?? haversineKm(ngoLocation, d.pickup_location);
  const score = d.match_score ?? d.ai_match_score;

  return (
    <article
      className={`card flex animate-fade-up flex-col p-4 transition-shadow hover:shadow-lg sm:p-5 ${
        isOffer ? 'border-primary/40 ring-1 ring-primary/20' : ''
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {isOffer ? (
            <span className="badge bg-primary text-white ring-primary">
              <Icon name="sparkles" size={12} strokeWidth={2.2} /> AI offer
            </span>
          ) : (
            <span className="badge bg-slate-100 text-slate-600 ring-slate-200">Open</span>
          )}
          <UrgencyBadge level={d.urgency_level} />
        </div>
        <ScoreBadge score={score} />
      </div>

      <h3 className="mt-3 line-clamp-2 text-base font-semibold text-dark">{summarizeItems(d.food_items)}</h3>
      <p className="mt-0.5 truncate text-xs text-slate-500">from {d.donor_name || 'a donor'}</p>

      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-xl bg-surface px-3 py-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Quantity</p>
          <p className="metric text-lg text-dark">{formatKg(donationTotalKg(d))}</p>
        </div>
        <div className="rounded-xl bg-surface px-3 py-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Expires in</p>
          <Countdown target={donationEarliestExpiry(d)} className="text-base" showIcon={false} />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {categories.map((c) => (
          <span key={c} className="rounded-full bg-primary-light px-2.5 py-0.5 text-xs font-medium text-primary">
            {FOOD_CATEGORY_LABELS[c] || c}
          </span>
        ))}
        {allergens.length ? (
          <span className="rounded-full bg-critical-light px-2.5 py-0.5 text-xs font-medium text-critical" title={allergens.join(', ')}>
            Allergens: {allergens.slice(0, 3).join(', ')}
            {allergens.length > 3 ? '…' : ''}
          </span>
        ) : null}
      </div>

      <p className="mt-3 flex items-start gap-1.5 text-xs text-slate-500">
        <Icon name="map-pin" size={14} className="mt-px shrink-0" />
        <span className="line-clamp-2">
          {d.pickup_location?.address || 'Pickup location'}
          {distance !== null && distance !== undefined ? <span className="font-mono font-semibold text-dark"> · {formatDistance(distance)}</span> : null}
        </span>
      </p>
      {d.notes ? <p className="mt-2 line-clamp-2 rounded-lg bg-accent-light px-2.5 py-1.5 text-xs text-[#7E5109]">{d.notes}</p> : null}

      <div className="mt-4 flex gap-2 pt-1">
        <button type="button" className="btn btn-primary flex-1" onClick={() => onAccept(d)} disabled={busy}>
          {busy ? <Spinner size={16} /> : <Icon name="check" size={16} />} Accept
        </button>
        <button type="button" className="btn btn-secondary flex-1" onClick={() => onDecline(d)} disabled={busy}>
          <Icon name="x" size={16} /> {isOffer ? 'Decline' : 'Hide'}
        </button>
      </div>
    </article>
  );
}
