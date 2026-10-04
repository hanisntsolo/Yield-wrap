import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import Icon from '../common/Icon';
import SectionCard from '../common/SectionCard';
import StatCard from '../common/StatCard';
import ConfirmDialog from '../common/ConfirmDialog';
import EmptyState from '../common/EmptyState';
import ErrorState from '../common/ErrorState';
import Switch from '../common/Switch';
import { SkeletonRows } from '../common/Skeleton';
import useFetch from '../../hooks/useFetch';
import { adMarketApi, asList, errorMessage, ngoAdsApi } from '../../services/api';
import { formatINR, formatNumber } from '../../utils/formatters';
import AdSpaceFormModal from './AdSpaceFormModal';
import NgoAdBookings from './NgoAdBookings';
import { Credits } from './AdBadges';
import { creditsToInr, normalizePricing, num } from './adUtils';

/** NGO dashboard: "Ad spaces & earnings" (earnings, spaces CRUD, poster bookings). */
export default function NgoAdsSection() {
  const walletQ = useFetch(() => adMarketApi.wallet(), [], { pollMs: 60000 });
  const pricingQ = useFetch(() => adMarketApi.pricing(), []);
  const spacesQ = useFetch(() => ngoAdsApi.spaces(), []);
  const bookingsQ = useFetch(() => ngoAdsApi.bookings(), [], { pollMs: 60000 });
  const pricing = useMemo(() => normalizePricing(pricingQ.data), [pricingQ.data]);
  const spaces = asList(spacesQ.data, 'spaces');
  const bookings = asList(bookingsQ.data, 'campaigns', 'bookings');
  const pendingBookings = bookings.filter((b) => b.poster?.booking_status === 'requested' && b.status === 'active').length;
  const earnings = num(walletQ.data?.earnings_credits);

  const [editing, setEditing] = useState(null); // null | {} (new) | space
  const [toDelete, setToDelete] = useState(null);
  const [togglingId, setTogglingId] = useState(null);

  const toggleActive = async (s) => {
    setTogglingId(s.id);
    try {
      const updated = await ngoAdsApi.updateSpace(s.id, { active: !s.active });
      spacesQ.setData((d) => asList(d, 'spaces').map((x) => (x.id === s.id ? { ...x, ...(updated || { active: !s.active }) } : x)));
      toast.success(s.active ? 'Space paused. It is hidden from advertisers.' : 'Space is live again');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not update the space'));
    } finally {
      setTogglingId(null);
    }
  };

  const remove = async () => {
    try {
      await ngoAdsApi.deleteSpace(toDelete.id);
      spacesQ.setData((d) => asList(d, 'spaces').filter((x) => x.id !== toDelete.id));
      toast.success('Ad space deleted');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not delete the space'));
      throw err;
    }
  };

  return (
    <SectionCard
      id="ad-spaces"
      title="Ad spaces & earnings"
      subtitle={`Host sponsor posters and earn ${Math.round(pricing.ngo_revenue_share * 100)}% of ad spend`}
      icon="megaphone"
      actions={
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setEditing({})}>
          <Icon name="plus" size={14} /> New space
        </button>
      }
    >
      <div className="grid gap-3 p-4 sm:grid-cols-3 sm:px-6">
        <StatCard label="Earnings" value={<Credits value={earnings} />} hint={`≈ ${formatINR(creditsToInr(earnings, pricing))}`} icon="heart" loading={walletQ.loading} />
        <StatCard label="Listed spaces" value={formatNumber(spaces.filter((s) => s.active !== false).length)} icon="building" tone="blue" loading={spacesQ.loading} />
        <StatCard label="Bookings to confirm" value={formatNumber(pendingBookings)} icon="clock" tone="accent" loading={bookingsQ.loading} />
      </div>

      <div className="border-t border-slate-100">
        <h3 className="px-4 pt-4 text-sm font-semibold text-dark sm:px-6">Your spaces</h3>
        {spacesQ.loading ? (
          <SkeletonRows rows={2} />
        ) : spacesQ.error && !spacesQ.data ? (
          <ErrorState error={spacesQ.error} onRetry={spacesQ.reload} compact />
        ) : !spaces.length ? (
          <EmptyState compact icon="building" title="No ad spaces yet" description="List a wall or notice board where a sponsor's poster can hang." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {spaces.map((s) => (
              <li key={s.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:px-6">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-dark">{s.name}</p>
                  <p className="truncate text-xs text-slate-500">
                    {s.size || 'Poster'} · <Credits value={s.credits_per_week} /> / week
                    {s.description ? ` · ${s.description}` : ''}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Switch checked={s.active !== false} busy={togglingId === s.id} onChange={() => toggleActive(s)} label={s.active !== false ? 'Live' : 'Paused'} />
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(s)}>
                    <Icon name="edit" size={13} /> Edit
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm text-critical hover:bg-critical-light" onClick={() => setToDelete(s)} aria-label={`Delete ${s.name}`}>
                    <Icon name="trash" size={13} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-slate-100">
        <h3 className="px-4 pt-4 text-sm font-semibold text-dark sm:px-6">Poster bookings</h3>
        <NgoAdBookings
          bookingsQ={bookingsQ}
          pricing={pricing}
          onChanged={() => {
            walletQ.reload();
            bookingsQ.reload();
          }}
        />
      </div>

      <AdSpaceFormModal
        open={Boolean(editing)}
        space={editing?.id ? editing : null}
        onClose={() => setEditing(null)}
        onSaved={() => spacesQ.reload()}
      />
      <ConfirmDialog
        open={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        onConfirm={remove}
        title="Delete this ad space?"
        confirmLabel="Delete space"
        message={
          <>
            <strong className="text-dark">{toDelete?.name}</strong> will be removed. Spaces with a live booking cannot be deleted.
          </>
        }
      />
    </SectionCard>
  );
}
