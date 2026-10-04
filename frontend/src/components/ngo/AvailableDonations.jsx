import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import DonationOfferCard from './DonationOfferCard';
import ConfirmDialog from '../common/ConfirmDialog';
import EmptyState from '../common/EmptyState';
import ErrorState from '../common/ErrorState';
import { SkeletonCard } from '../common/Skeleton';
import { asList, errorMessage, ngoApi } from '../../services/api';
import { summarizeItems } from '../../utils/formatters';

/** Incoming AI offers + open compatible donations with Accept / Decline. */
export default function AvailableDonations({ query, ngoLocation, onChanged }) {
  const { data, loading, error, reload } = query;
  const [busyId, setBusyId] = useState(null);
  const [declining, setDeclining] = useState(null);
  const [hidden, setHidden] = useState(() => new Set());

  const list = useMemo(
    () =>
      asList(data, 'donations')
        .filter((d) => !hidden.has(d.id))
        .sort((a, b) => (a.offer_type === 'offer' ? 0 : 1) - (b.offer_type === 'offer' ? 0 : 1)),
    [data, hidden],
  );

  const accept = async (d) => {
    setBusyId(d.id);
    try {
      const res = await ngoApi.accept(d.id);
      const v = res?.volunteer_assignment;
      toast.success(v?.name ? `Accepted! ${v.name} is on the way to pick it up.` : 'Accepted! We are finding a volunteer.');
      reload();
      onChanged?.();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not accept this donation'));
      reload();
    } finally {
      setBusyId(null);
    }
  };

  const onDecline = (d) => {
    if (d.offer_type === 'offer') setDeclining(d);
    else {
      setHidden((s) => new Set(s).add(d.id));
      toast('Hidden from your list', { duration: 2500 });
    }
  };

  const confirmDecline = async () => {
    try {
      await ngoApi.decline(declining.id);
      toast.success('Offer declined — it will pass to the next NGO');
      setHidden((s) => new Set(s).add(declining.id));
      reload();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not decline this offer'));
      throw err;
    }
  };

  if (loading) {
    return (
      <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-6 2xl:grid-cols-3">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!list.length) {
    return (
      <EmptyState
        icon="inbox"
        title="No donations waiting"
        description="New AI offers appear here automatically. Keep your capacity up to date to get better matches."
      />
    );
  }

  return (
    <>
      <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-6 2xl:grid-cols-3">
        {list.map((d) => (
          <DonationOfferCard key={d.id} donation={d} ngoLocation={ngoLocation} onAccept={accept} onDecline={onDecline} busy={busyId === d.id} />
        ))}
      </div>
      <ConfirmDialog
        open={Boolean(declining)}
        onClose={() => setDeclining(null)}
        onConfirm={confirmDecline}
        title="Decline this offer?"
        confirmLabel="Decline offer"
        message={
          <>
            <strong className="text-dark">{summarizeItems(declining?.food_items)}</strong> will be offered to the next best NGO. Declining often
            lowers your acceptance rate used in future matching.
          </>
        }
      />
    </>
  );
}
