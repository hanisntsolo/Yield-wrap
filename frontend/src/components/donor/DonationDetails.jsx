import Modal from '../common/Modal';
import StatusBadge from '../common/StatusBadge';
import UrgencyBadge from '../common/UrgencyBadge';
import Countdown from '../common/Countdown';
import ScoreBadge from '../common/ScoreBadge';
import StageProgress from '../common/StageProgress';
import Icon from '../common/Icon';
import { PartnerName } from '../common/VerifiedBadge';
import PackagingSummary from '../ads/PackagingSummary';
import { FOOD_CATEGORY_LABELS } from '../../utils/constants';
import { donationEarliestExpiry, donationTotalKg, formatDateTime, formatDistance, formatKg } from '../../utils/formatters';

function Row({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-dark">{children}</dd>
    </div>
  );
}

export default function DonationDetails({ donation: d, open, onClose }) {
  if (!d) return null;
  const items = Array.isArray(d.food_items) ? d.food_items : [];
  const candidates = Array.isArray(d.match_candidates) ? d.match_candidates : [];
  return (
    <Modal open={open} onClose={onClose} size="lg" title="Donation details" description={`Listed ${formatDateTime(d.created_at)}`}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={d.status} stage={d.task_stage} />
          <UrgencyBadge level={d.urgency_level} />
          {d.ai_match_score !== null && d.ai_match_score !== undefined ? <ScoreBadge score={d.ai_match_score} /> : null}
          {['pending', 'matched'].includes(d.status) ? <Countdown target={donationEarliestExpiry(d)} prefix="Expires in" /> : null}
        </div>

        {d.task_stage ? (
          <div className="rounded-2xl bg-surface p-4">
            <StageProgress stage={d.task_stage} status={d.status} />
          </div>
        ) : null}

        <section>
          <h3 className="mb-2 text-sm font-semibold text-dark">Food items · {formatKg(donationTotalKg(d))}</h3>
          <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
            {items.map((it, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-dark">{it.name}</p>
                  <p className="text-xs text-slate-500">
                    {FOOD_CATEGORY_LABELS[it.category] || it.category} · best before {formatDateTime(it.expiry_time)}
                  </p>
                  {it.allergens?.length ? (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {it.allergens.map((a) => (
                        <span key={a} className="rounded-full bg-critical-light px-2 py-0.5 text-[11px] font-semibold text-critical">
                          {a}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
                <span className="font-mono font-semibold">{formatKg(it.quantity_kg)}</span>
              </li>
            ))}
          </ul>
        </section>

        <dl className="divide-y divide-slate-100">
          <Row label="Pickup">{d.pickup_location?.address || '—'}</Row>
          <Row label="NGO">
            {d.matched_ngo_name ? <PartnerName name={d.matched_ngo_name} ids={[d.matched_ngo_id]} /> : '—'}
          </Row>
          {d.delivery_location?.address ? <Row label="Delivery">{d.delivery_location.address}</Row> : null}
          <Row label="Volunteer">{d.assigned_volunteer_name || '—'}</Row>
          {d.notes ? <Row label="Notes">{d.notes}</Row> : null}
          {d.picked_up_at ? <Row label="Picked up">{formatDateTime(d.picked_up_at)}</Row> : null}
          {d.delivered_at ? <Row label="Delivered">{formatDateTime(d.delivered_at)}</Row> : null}
        </dl>

        {d.delivery_record ? (
          <section className="rounded-2xl border border-primary/20 bg-primary-light/50 p-4">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-primary">
              <Icon name="shield" size={16} /> Food safety audit
            </h3>
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-slate-500">Received by</dt>
                <dd className="font-medium">{d.delivery_record.receiver_name || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Quantity confirmed</dt>
                <dd className="font-mono font-semibold">{formatKg(d.delivery_record.quantity_confirmed_kg)}</dd>
              </div>
            </dl>
          </section>
        ) : null}

        <PackagingSummary donation={d} />

        {candidates.length ? (
          <section>
            <h3 className="mb-2 text-sm font-semibold text-dark">AI match candidates</h3>
            <ul className="space-y-2">
              {candidates.map((c, i) => (
                <li key={c.ngo_id || i} className="flex items-center justify-between gap-3 rounded-xl bg-surface px-3 py-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="font-mono text-xs text-slate-400">#{i + 1}</span>
                    <PartnerName name={c.organization_name} ids={[c.ngo_id]} className="font-medium" />
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="font-mono text-xs text-slate-500">{formatDistance(c.distance_km)}</span>
                    <ScoreBadge score={c.score} />
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </Modal>
  );
}
