import { useSearchParams } from 'react-router-dom';
import DashboardShell from '../components/common/DashboardShell';
import SectionCard from '../components/common/SectionCard';
import Tabs from '../components/common/Tabs';
import Icon from '../components/common/Icon';
import KpiGrid from '../components/admin/KpiGrid';
import LiveMap from '../components/admin/LiveMap';
import PriorityQueue from '../components/admin/PriorityQueue';
import ImpactPanel from '../components/admin/ImpactPanel';
import ChartsSection from '../components/admin/ChartsSection';
import UserTable from '../components/admin/UserTable';
import AllDonationsTable from '../components/admin/AllDonationsTable';
import BroadcastForm from '../components/admin/BroadcastForm';
import AdCreativesQueue from '../components/admin/AdCreativesQueue';
import AdRevenuePanel from '../components/admin/AdRevenuePanel';
import AdCampaignsTable from '../components/admin/AdCampaignsTable';
import useFetch from '../hooks/useFetch';
import { adminApi, analyticsApi } from '../services/api';
import { POLL } from '../utils/constants';
import { formatNumber } from '../utils/formatters';

const TAB_VALUES = ['overview', 'analytics', 'users', 'donations', 'ads', 'broadcast'];

export default function AdminDashboard() {
  const [params, setParams] = useSearchParams();
  const tab = TAB_VALUES.includes(params.get('tab')) ? params.get('tab') : 'overview';
  const setTab = (t) => setParams(t === 'overview' ? {} : { tab: t }, { replace: true });

  const kpiQ = useFetch(() => analyticsApi.dashboard(), [], { pollMs: POLL.dashboard });
  const statsQ = useFetch(() => adminApi.systemStats(), [], { pollMs: 60000 });
  const pendingNgos = statsQ.data?.pending_ngo_verifications;
  const adRevenueQ = useFetch(() => adminApi.adRevenue(), [], { pollMs: 60000 });
  const pendingCreatives = adRevenueQ.data?.pending_creatives;

  const tabs = [
    { value: 'overview', label: 'Overview', icon: 'grid' },
    { value: 'analytics', label: 'Analytics', icon: 'chart' },
    { value: 'users', label: 'Users', icon: 'users', count: pendingNgos || undefined },
    { value: 'donations', label: 'Donations', icon: 'package' },
    { value: 'ads', label: 'Ads', icon: 'sparkles', count: pendingCreatives || undefined },
    { value: 'broadcast', label: 'Broadcast', icon: 'megaphone' },
  ];

  return (
    <DashboardShell
      page="admin_dashboard"
      title="Operations console"
      subtitle="Real-time view of donations, volunteers and NGOs across the network."
      actions={
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => {
            kpiQ.reload();
            statsQ.reload();
            adRevenueQ.reload();
          }}
        >
          <Icon name="refresh" size={14} /> Refresh
        </button>
      }
      banner={
        pendingNgos ? (
          <button
            type="button"
            onClick={() => setTab('users')}
            className="flex w-full items-center gap-3 rounded-2xl border border-accent/40 bg-accent-light p-4 text-left text-sm"
          >
            <Icon name="shield" className="text-[#B9770E]" />
            <span className="flex-1">
              <strong className="text-dark">{formatNumber(pendingNgos)} NGO{pendingNgos === 1 ? '' : 's'}</strong> awaiting verification
            </span>
            <Icon name="chevron-right" size={16} className="text-slate-400" />
          </button>
        ) : null
      }
    >
      <KpiGrid data={kpiQ.data} loading={kpiQ.loading} error={kpiQ.error} onRetry={kpiQ.reload} />

      <Tabs tabs={tabs} value={tab} onChange={setTab} ariaLabel="Admin sections" />

      {tab === 'overview' ? (
        <>
          <SectionCard id="live-map" title="Live map" subtitle="Open donations, volunteers and NGO load" icon="map" bodyClassName="card-pad">
            <LiveMap />
          </SectionCard>
          <div className="grid gap-6 xl:grid-cols-3">
            <SectionCard id="priority-queue" className="xl:col-span-2" title="Priority queue" subtitle="AI-ranked by urgency, expiry and quantity" icon="zap">
              <PriorityQueue />
            </SectionCard>
            <SectionCard id="impact" title="Impact" subtitle="Environmental savings to date" icon="leaf" bodyClassName="card-pad">
              <ImpactPanel />
            </SectionCard>
          </div>
        </>
      ) : null}

      {tab === 'analytics' ? <ChartsSection /> : null}

      {tab === 'users' ? (
        <SectionCard id="users" title="User management" subtitle="Verify NGOs, suspend or remove accounts" icon="users">
          <UserTable />
        </SectionCard>
      ) : null}

      {tab === 'donations' ? (
        <SectionCard id="donations" title="All donations" subtitle="Every listing on the platform" icon="package">
          <AllDonationsTable />
        </SectionCard>
      ) : null}

      {tab === 'ads' ? (
        <>
          <AdRevenuePanel query={adRevenueQ} />
          <SectionCard id="creative-review" title="Creative review" subtitle="Approve sponsor designs before they go on packets" icon="sparkles">
            <AdCreativesQueue onReviewed={adRevenueQ.reload} />
          </SectionCard>
          <SectionCard id="all-campaigns" title="All campaigns" subtitle="Packet, poster and digital campaigns" icon="megaphone">
            <AdCampaignsTable />
          </SectionCard>
        </>
      ) : null}

      {tab === 'broadcast' ? (
        <SectionCard id="broadcast" title="Broadcast" subtitle="Send a push + in-app notification" icon="megaphone" bodyClassName="card-pad">
          <BroadcastForm />
        </SectionCard>
      ) : null}
    </DashboardShell>
  );
}
