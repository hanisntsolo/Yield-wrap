import toast from 'react-hot-toast';
import Icon from '../common/Icon';
import { titleCase } from '../../utils/formatters';

const TONES = {
  green: 'bg-primary-light text-primary ring-primary/20',
  amber: 'bg-accent-light text-[#B9770E] ring-accent/30',
  red: 'bg-critical-light text-critical ring-critical/30',
  blue: 'bg-[#EAF2FB] text-[#21618C] ring-[#3498DB]/30',
  slate: 'bg-slate-100 text-slate-600 ring-slate-200',
};

const CREATIVE = { pending: ['Pending review', 'amber', 'clock'], approved: ['Approved', 'green', 'check-circle'], rejected: ['Rejected', 'red', 'x-circle'] };
const CAMPAIGN = { active: ['Active', 'green', 'zap'], completed: ['Completed', 'blue', 'check-all'], cancelled: ['Cancelled', 'slate', 'ban'], rejected: ['Rejected', 'red', 'x-circle'] };
const BOOKING = { requested: ['Awaiting NGO', 'amber', 'clock'], displayed: ['On display', 'green', 'eye'], declined: ['Declined', 'red', 'x-circle'] };

function Badge({ map, status, className = '' }) {
  const [label, tone, icon] = map[status] || [titleCase(status) || 'Unknown', 'slate', 'info'];
  return (
    <span className={`badge ${TONES[tone]} ${className}`}>
      <Icon name={icon} size={11} strokeWidth={2.6} />
      {label}
    </span>
  );
}

export const CreativeStatusBadge = (p) => <Badge map={CREATIVE} {...p} />;
export const CampaignStatusBadge = (p) => <Badge map={CAMPAIGN} {...p} />;
export const BookingStatusBadge = (p) => <Badge map={BOOKING} {...p} />;

/** Credits pill, e.g. "120 cr". */
export function Credits({ value, className = '' }) {
  return (
    <span className={`metric ${className}`}>
      {Number.isFinite(Number(value)) ? Number(value).toLocaleString('en-IN') : '—'}
      <span className="ml-0.5 text-[0.75em] font-semibold text-slate-500">cr</span>
    </span>
  );
}

/** Toast for 402 INSUFFICIENT_CREDITS with a "Buy credits" action. */
export function toastInsufficientCredits(onBuy, message = 'Not enough credits for this campaign.') {
  toast.error(
    (t) => (
      <span className="flex flex-wrap items-center gap-2">
        <span>{message}</span>
        {onBuy ? (
          <button
            type="button"
            className="rounded-lg bg-white px-2.5 py-1 text-xs font-bold text-dark hover:bg-slate-100"
            onClick={() => {
              toast.dismiss(t.id);
              onBuy();
            }}
          >
            Buy credits
          </button>
        ) : null}
      </span>
    ),
    { duration: 8000, id: 'insufficient-credits' },
  );
}
