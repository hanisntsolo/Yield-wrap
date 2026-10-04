import { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import Icon from '../common/Icon';
import ConfirmDialog from '../common/ConfirmDialog';
import EmptyState from '../common/EmptyState';
import ErrorState from '../common/ErrorState';
import { SkeletonRows } from '../common/Skeleton';
import { asList, errorMessage, ngoAdsApi } from '../../services/api';
import { formatDate, formatNumber } from '../../utils/formatters';
import { BookingStatusBadge, Credits } from './AdBadges';
import StickerPreview from './StickerPreview';
import { num } from './adUtils';

/** Poster bookings on the NGO's spaces: preview, print, mark displayed / decline. */
export default function NgoAdBookings({ bookingsQ, pricing, onChanged }) {
  const [confirm, setConfirm] = useState(null); // {type:'displayed'|'decline', c}
  const bookings = asList(bookingsQ.data, 'campaigns', 'bookings');

  const run = async () => {
    const { type, c } = confirm;
    try {
      const updated = type === 'displayed' ? await ngoAdsApi.markDisplayed(c.id) : await ngoAdsApi.decline(c.id);
      toast.success(type === 'displayed' ? 'Marked as displayed. Earnings credited to your wallet.' : 'Booking declined. The advertiser has been refunded.');
      bookingsQ.setData((d) => asList(d, 'campaigns', 'bookings').map((x) => (x.id === c.id ? { ...x, ...(updated || {}) } : x)));
      onChanged?.();
    } catch (err) {
      toast.error(errorMessage(err, 'Action failed'));
      throw err;
    }
  };

  if (bookingsQ.loading) return <SkeletonRows rows={3} />;
  if (bookingsQ.error && !bookingsQ.data) return <ErrorState error={bookingsQ.error} onRetry={bookingsQ.reload} compact />;
  if (!bookings.length) return <EmptyState compact icon="calendar" title="No poster bookings yet" description="Advertisers nearby will see your listed spaces." />;

  const share = num(pricing?.ngo_revenue_share, 0.3);
  const isDisplay = confirm?.type === 'displayed';

  return (
    <>
      <ul className="divide-y divide-slate-100">
        {bookings.map((c) => {
          const status = c.poster?.booking_status;
          return (
            <li key={c.id} className="flex flex-col gap-3 px-4 py-4 sm:px-6 md:flex-row md:items-center">
              <StickerPreview creative={c.creative} sponsor={c.owner_name} className="md:w-72" />
              <div className="min-w-0 flex-1 space-y-1 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <BookingStatusBadge status={status} />
                  <span className="text-xs text-slate-500">{c.poster?.space_name}</span>
                </div>
                <p className="text-slate-600">
                  <span className="font-mono">{num(c.poster?.weeks)}</span> week(s) · <Credits value={c.credits_spent} /> · you earn{' '}
                  <Credits value={Math.floor(num(c.credits_spent) * share)} className="text-primary" />
                </p>
                {c.poster?.starts_at ? (
                  <p className="text-xs text-slate-500">
                    {formatDate(c.poster.starts_at)} – {formatDate(c.poster.ends_at)}
                  </p>
                ) : (
                  <p className="text-xs text-slate-500">Booked {formatDate(c.created_at)}</p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Link to={`/print/poster/${c.id}`} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">
                  <Icon name="download" size={13} /> Print poster
                </Link>
                {status === 'requested' && c.status === 'active' ? (
                  <>
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => setConfirm({ type: 'displayed', c })}>
                      <Icon name="eye" size={13} /> Mark displayed
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm text-critical hover:bg-critical-light" onClick={() => setConfirm({ type: 'decline', c })}>
                      <Icon name="x" size={13} /> Decline
                    </button>
                  </>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        onConfirm={run}
        tone={isDisplay ? 'primary' : 'danger'}
        title={isDisplay ? 'Poster is up?' : 'Decline this booking?'}
        confirmLabel={isDisplay ? 'Yes, it is displayed' : 'Decline booking'}
        message={
          isDisplay ? (
            <>
              Confirm that <strong className="text-dark">{confirm?.c?.creative?.title}</strong> is on display. The booking period starts now and you earn{' '}
              <Credits value={Math.floor(num(confirm?.c?.credits_spent) * share)} />.
            </>
          ) : (
            <>
              <strong className="text-dark">{confirm?.c?.owner_name}</strong> gets a full refund of <span className="font-mono">{formatNumber(confirm?.c?.credits_spent)}</span> credits. This cannot be undone.
            </>
          )
        }
      />
    </>
  );
}
