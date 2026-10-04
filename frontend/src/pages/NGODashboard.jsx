import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import DashboardShell from '../components/common/DashboardShell';
import SectionCard from '../components/common/SectionCard';
import StatCard from '../components/common/StatCard';
import Icon from '../components/common/Icon';
import VerifiedBadge from '../components/common/VerifiedBadge';
import AvailableDonations from '../components/ngo/AvailableDonations';
import CapacityManager from '../components/ngo/CapacityManager';
import ActiveDeliveries from '../components/ngo/ActiveDeliveries';
import ForecastChart from '../components/ngo/ForecastChart';
import HistoryTable, { CsvButton } from '../components/ngo/HistoryTable';
import NgoAdsSection from '../components/ads/NgoAdsSection';
import useFetch from '../hooks/useFetch';
import { asList, ngoApi } from '../services/api';
import { FOOD_CATEGORY_LABELS, POLL } from '../utils/constants';
import { formatNumber, formatPercent } from '../utils/formatters';

function VerificationBanner({ hasDocument }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-accent/40 bg-accent-light p-4 sm:flex-row sm:items-center" role="status">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-dark">
        <Icon name="shield" />
      </span>
      <div className="flex-1 text-sm">
        <p className="font-semibold text-dark">Your organisation is awaiting verification</p>
        <p className="text-slate-600">
          {hasDocument
            ? 'An admin is reviewing your registration document. AI offers start flowing once you are verified.'
            : 'Upload your registration certificate so an admin can verify your NGO and unlock AI offers.'}
        </p>
      </div>
      {!hasDocument ? (
        <Link to="/profile" className="btn btn-accent btn-sm self-start sm:self-center">
          <Icon name="upload" size={14} /> Upload document
        </Link>
      ) : null}
    </div>
  );
}

export default function NGODashboard() {
  const { user, profile: authProfile, setProfile } = useAuth();
  const profileQ = useFetch(() => ngoApi.profile(), [], { pollMs: 60000 });
  const availableQ = useFetch(() => ngoApi.availableDonations(), [], { pollMs: POLL.ngoDonations });
  const incomingQ = useFetch(() => ngoApi.incoming(), [], { pollMs: POLL.dashboard });

  const profile = profileQ.data?.profile ?? profileQ.data ?? authProfile ?? {};
  const isVerified = profile?.is_verified ?? user?.is_verified;
  const available = useMemo(() => asList(availableQ.data, 'donations'), [availableQ.data]);
  const incoming = useMemo(() => asList(incomingQ.data, 'donations'), [incomingQ.data]);
  const offers = available.filter((d) => d.offer_type === 'offer').length;
  const capacity = Number(profile?.storage_capacity_kg) || 0;
  const load = Number(profile?.current_load_kg) || 0;
  const utilisation = capacity ? (load / capacity) * 100 : null;
  const ngoLocation = profile?.location || user?.location;
  const orgName = profile?.organization_name || user?.name;

  const onCapacitySaved = (next) => {
    if (next && typeof next === 'object') {
      profileQ.setData(next);
      setProfile?.(next);
    } else profileQ.reload();
    availableQ.reload();
  };

  return (
    <DashboardShell
      page="ngo_dashboard"
      title={
        <span className="inline-flex flex-wrap items-center gap-2">
          {orgName || 'NGO dashboard'}
          {user?.is_premium_partner ? <VerifiedBadge /> : null}
        </span>
      }
      subtitle="Accept surplus food, manage capacity and track incoming deliveries."
      banner={isVerified === false ? <VerificationBanner hasDocument={Boolean(profile?.document_url)} /> : null}
      actions={
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => {
            availableQ.reload();
            incomingQ.reload();
            profileQ.reload();
          }}
        >
          <Icon name="refresh" size={14} /> Refresh
        </button>
      }
    >
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="AI offers waiting" value={formatNumber(offers)} hint={`${available.length} available in total`} icon="sparkles" loading={availableQ.loading} />
        <StatCard label="Deliveries en route" value={formatNumber(incoming.length)} icon="truck" tone="purple" loading={incomingQ.loading} />
        <StatCard
          label="Storage used"
          value={utilisation === null ? '—' : formatPercent(utilisation, { fraction: false })}
          icon="gauge"
          tone={utilisation >= 90 ? 'critical' : utilisation >= 70 ? 'accent' : 'blue'}
          loading={profileQ.loading && !authProfile}
        />
        <StatCard
          label="Beneficiaries"
          value={formatNumber(profile?.beneficiary_count, { compact: true })}
          hint={profile?.acceptance_rate !== undefined ? `Acceptance rate ${formatPercent(profile.acceptance_rate)}` : undefined}
          icon="users"
          tone="accent"
          loading={profileQ.loading && !authProfile}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <SectionCard
          id="incoming-matches"
          className="xl:col-span-2"
          title="Incoming matches"
          subtitle="AI offers first, then open donations compatible with your NGO"
          icon="inbox"
        >
          <AvailableDonations
            query={availableQ}
            ngoLocation={ngoLocation}
            onChanged={() => {
              incomingQ.reload();
              profileQ.reload();
            }}
          />
        </SectionCard>

        <div className="space-y-6">
          <SectionCard id="capacity" title="Capacity" subtitle="Keep this current for better matches" icon="gauge" bodyClassName="card-pad">
            <CapacityManager profile={profile} onSaved={onCapacitySaved} />
          </SectionCard>
          {profile?.accepted_food_types?.length ? (
            <div className="card card-pad">
              <h2 className="card-title">Accepted food types</h2>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {profile.accepted_food_types.map((t) => (
                  <span key={t} className="chip chip-on text-xs">
                    {FOOD_CATEGORY_LABELS[t] || t}
                  </span>
                ))}
              </div>
              {profile?.operating_hours?.open ? (
                <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
                  <Icon name="clock" size={13} /> Open {profile.operating_hours.open} – {profile.operating_hours.close}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <SectionCard id="active-deliveries" title="Active deliveries" subtitle="Accepted donations on their way to you" icon="truck">
        <ActiveDeliveries query={incomingQ} ngoLocation={ngoLocation} ngoName={orgName} />
      </SectionCard>

      <NgoAdsSection />

      <SectionCard id="forecast" title="Demand forecast" subtitle="Predicted food needed over the next 7 days" icon="chart" bodyClassName="card-pad">
        <ForecastChart days={7} />
      </SectionCard>

      <SectionCard id="history" title="Delivery history" subtitle="Everything you have received" icon="calendar" actions={<CsvButton />}>
        <HistoryTable />
      </SectionCard>
    </DashboardShell>
  );
}
