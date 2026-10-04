import { useCallback, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import DashboardShell from '../components/common/DashboardShell';
import SectionCard from '../components/common/SectionCard';
import StatCard from '../components/common/StatCard';
import ConfirmDialog from '../components/common/ConfirmDialog';
import Modal from '../components/common/Modal';
import Icon from '../components/common/Icon';
import DonationForm from '../components/DonationForm';
import DonationsTable, { canTrackDonation } from '../components/donor/DonationsTable';
import DonationDetails from '../components/donor/DonationDetails';
import LiveTracking from '../components/donor/LiveTracking';
import useFetch from '../hooks/useFetch';
import usePolling from '../hooks/usePolling';
import { asList, donorApi, errorMessage } from '../services/api';
import { formatKg, formatNumber, summarizeItems } from '../utils/formatters';

const MAX_ETA_LOOKUPS = 5;

export default function DonorDashboard() {
  const { user } = useAuth();
  const donationsQ = useFetch(() => donorApi.listDonations(), [], { pollMs: 20000 });
  const statsQ = useFetch(() => donorApi.stats(), [], { pollMs: 60000 });
  const donations = useMemo(() => asList(donationsQ.data, 'donations'), [donationsQ.data]);
  const stats = statsQ.data || {};

  const [trackId, setTrackId] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [editing, setEditing] = useState(null);
  const [cancelling, setCancelling] = useState(null);
  const [etas, setEtas] = useState({});
  const trackingRef = useRef(null);

  const activeDonations = useMemo(() => donations.filter(canTrackDonation), [donations]);
  const tracked = donations.find((d) => d.id === trackId) || (trackId === 'none' ? null : activeDonations[0]) || null;

  const reloadAll = useCallback(() => {
    donationsQ.reload();
    statsQ.reload();
  }, [donationsQ, statsQ]);

  // ETA column: look up /track for a handful of active donations (the tracked one reports via onEta).
  const refreshEtas = useCallback(async () => {
    const targets = activeDonations.filter((d) => d.task_stage && d.id !== tracked?.id).slice(0, MAX_ETA_LOOKUPS);
    if (!targets.length) return;
    const results = await Promise.allSettled(targets.map((d) => donorApi.track(d.id)));
    setEtas((prev) => {
      const next = { ...prev };
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') next[targets[i].id] = r.value?.eta_minutes ?? null;
      });
      return next;
    });
  }, [activeDonations, tracked?.id]);
  usePolling(refreshEtas, 30000, { enabled: activeDonations.length > 0, immediate: true });

  const onEta = useCallback((id, minutes) => setEtas((prev) => (prev[id] === minutes ? prev : { ...prev, [id]: minutes })), []);

  const handleTrack = (d) => {
    setTrackId(d.id);
    setTimeout(() => trackingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  const confirmCancel = async () => {
    try {
      await donorApi.cancelDonation(cancelling.id);
      toast.success('Donation cancelled');
      reloadAll();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not cancel this donation'));
      throw err;
    }
  };

  const firstName = (user?.name || '').split(' ')[0] || 'there';

  return (
    <DashboardShell
      page="donor_dashboard"
      title={`Hi, ${firstName}`}
      subtitle="Turn today's surplus into tomorrow's sustenance."
      sidebarAd
      sidebar={
        <div className="card card-pad">
          <h2 className="card-title flex items-center gap-2">
            <Icon name="sparkles" size={18} className="text-primary" /> How matching works
          </h2>
          <ol className="mt-3 space-y-2.5 text-sm text-slate-600">
            <li>
              <span className="font-semibold text-dark">1.</span> Our AI scores nearby NGOs on distance, capacity, food fit and reliability.
            </li>
            <li>
              <span className="font-semibold text-dark">2.</span> The top NGO gets the first offer; if it declines, the next one does.
            </li>
            <li>
              <span className="font-semibold text-dark">3.</span> Once accepted, the nearest available volunteer is dispatched.
            </li>
          </ol>
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Food donated" value={formatKg(stats.total_kg_donated)} icon="package" loading={statsQ.loading} />
        <StatCard label="Meals contributed" value={formatNumber(stats.meals_contributed, { compact: true })} icon="utensils" tone="accent" loading={statsQ.loading} />
        <StatCard label="CO₂ saved" value={formatKg(stats.co2_saved_kg)} icon="leaf" tone="blue" loading={statsQ.loading} />
        <StatCard
          label="Deliveries"
          value={formatNumber(stats.delivered_count)}
          hint={stats.donations_count !== undefined ? `of ${formatNumber(stats.donations_count)} donations` : undefined}
          icon="truck"
          tone="purple"
          loading={statsQ.loading}
        />
      </div>

      <SectionCard id="quick-donate" title="Quick Donate" subtitle="List surplus food and get AI-ranked NGO matches" icon="plus" bodyClassName="card-pad">
        <DonationForm onCreated={reloadAll} />
      </SectionCard>

      {tracked ? (
        <div ref={trackingRef} className="scroll-mt-24">
          <SectionCard
            id="live-tracking"
            title="Live tracking"
            subtitle={activeDonations.length > 1 ? `${activeDonations.length} active deliveries — choose one below` : 'Follow your donation in real time'}
            icon="navigation"
            bodyClassName="card-pad"
            actions={
              activeDonations.length > 1 ? (
                <select
                  className="input w-auto py-1.5 text-xs"
                  value={tracked.id}
                  onChange={(e) => setTrackId(e.target.value)}
                  aria-label="Choose a donation to track"
                >
                  {activeDonations.map((d) => (
                    <option key={d.id} value={d.id}>
                      {summarizeItems(d.food_items)}
                    </option>
                  ))}
                </select>
              ) : null
            }
          >
            <LiveTracking key={tracked.id} donation={tracked} onEta={onEta} onClose={() => setTrackId('none')} />
          </SectionCard>
        </div>
      ) : null}

      <SectionCard
        id="my-donations"
        title="My donations"
        subtitle={donations.length ? `${donations.length} total` : undefined}
        icon="inbox"
        actions={
          <button type="button" className="btn btn-ghost btn-sm" onClick={reloadAll} aria-label="Refresh donations">
            <Icon name="refresh" size={14} /> Refresh
          </button>
        }
      >
        <DonationsTable
          donations={donations}
          loading={donationsQ.loading}
          error={donationsQ.error}
          onReload={donationsQ.reload}
          etas={etas}
          selectedId={tracked?.id}
          onTrack={handleTrack}
          onView={setViewing}
          onEdit={setEditing}
          onCancel={setCancelling}
        />
      </SectionCard>

      <DonationDetails donation={viewing} open={Boolean(viewing)} onClose={() => setViewing(null)} />

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} size="xl" title="Edit donation" description="You can edit a donation while it is still pending.">
        {editing ? (
          <DonationForm
            mode="edit"
            initial={editing}
            onCancel={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              reloadAll();
            }}
          />
        ) : null}
      </Modal>

      <ConfirmDialog
        open={Boolean(cancelling)}
        onClose={() => setCancelling(null)}
        onConfirm={confirmCancel}
        title="Cancel this donation?"
        confirmLabel="Cancel donation"
        cancelLabel="Keep it"
        message={
          <>
            <strong className="text-dark">{summarizeItems(cancelling?.food_items)}</strong> will be withdrawn
            {cancelling?.matched_ngo_name ? ` and ${cancelling.matched_ngo_name} will be notified` : ''}. This cannot be undone.
          </>
        }
      />
    </DashboardShell>
  );
}
