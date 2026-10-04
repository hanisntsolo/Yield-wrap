import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import DashboardShell from '../components/common/DashboardShell';
import SectionCard from '../components/common/SectionCard';
import Tabs from '../components/common/Tabs';
import Icon from '../components/common/Icon';
import WalletPanel from '../components/ads/WalletPanel';
import CreativesPanel from '../components/ads/CreativesPanel';
import CampaignWizard from '../components/ads/CampaignWizard';
import CampaignList from '../components/ads/CampaignList';
import MarketplaceStats from '../components/ads/MarketplaceStats';
import { Credits } from '../components/ads/AdBadges';
import { normalizePricing } from '../components/ads/adUtils';
import { useAuth } from '../context/AuthContext';
import useFetch from '../hooks/useFetch';
import { adMarketApi, asList } from '../services/api';
import { formatINR } from '../utils/formatters';

const TAB_VALUES = ['campaigns', 'creatives', 'wallet'];

/** Advertising hub: campaigns, creatives and wallet. Also the business dashboard (/business). */
export default function Advertising() {
  const { user, profile } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = TAB_VALUES.includes(params.get('tab')) ? params.get('tab') : 'campaigns';
  const setTab = (t) => setParams(t === 'campaigns' ? {} : { tab: t }, { replace: true });
  const [useCreativeId, setUseCreativeId] = useState(null);

  const pricingQ = useFetch(() => adMarketApi.pricing(), []);
  const walletQ = useFetch(() => adMarketApi.wallet(), []);
  const creativesQ = useFetch(() => adMarketApi.creatives(), [], { pollMs: 60000 });
  const campaignsQ = useFetch(() => adMarketApi.campaigns(), [], { pollMs: 30000 });
  const inventoryQ = useFetch(() => adMarketApi.inventory(), [], { pollMs: 60000 });
  const pricing = useMemo(() => normalizePricing(pricingQ.data), [pricingQ.data]);
  const creatives = asList(creativesQ.data, 'creatives');
  const pending = creatives.filter((c) => c.status === 'pending').length;
  const balance = walletQ.data?.credits ?? 0;

  const buyCredits = () => {
    setTab('wallet');
    setTimeout(() => document.getElementById('buy-credits')?.scrollIntoView({ behavior: 'smooth' }), 80);
  };

  useEffect(() => {
    if (tab !== 'campaigns') setUseCreativeId(null);
  }, [tab]);

  const tabs = [
    { value: 'campaigns', label: 'Campaigns', icon: 'megaphone' },
    { value: 'creatives', label: 'Creatives', icon: 'sparkles', count: pending || undefined },
    { value: 'wallet', label: 'Wallet', icon: 'zap' },
  ];

  const isBusiness = user?.role === 'business';

  return (
    <DashboardShell
      page="advertising"
      title={isBusiness ? `${profile?.business_name || user?.name || 'Your business'} · Ads` : 'Advertising'}
      subtitle="Sponsor food packaging, NGO posters and digital ads. Every sticker funds food rescue."
      actions={
        <button type="button" onClick={() => setTab('wallet')} className="flex items-center gap-2 rounded-xl border border-primary/30 bg-white px-3 py-2 text-sm shadow-sm hover:bg-primary-light">
          <Icon name="zap" size={16} className="text-primary" />
          <Credits value={balance} className="text-dark" />
          <span className="font-mono text-xs text-slate-500">{formatINR(balance * pricing.credit_value_inr)}</span>
        </button>
      }
    >
      <Tabs tabs={tabs} value={tab} onChange={setTab} ariaLabel="Advertising sections" />

      {tab === 'campaigns' ? (
        <>
          <MarketplaceStats inventoryQ={inventoryQ} />
          <SectionCard id="new-campaign" title="New campaign" subtitle="Credits are debited at launch; unused parts are refunded" icon="plus" bodyClassName="card-pad">
            <CampaignWizard
              pricing={pricing}
              balance={balance}
              creatives={creatives}
              inventory={inventoryQ.data}
              initialCreativeId={useCreativeId}
              onBuyCredits={buyCredits}
              onCreated={() => {
                campaignsQ.reload();
                walletQ.reload();
                inventoryQ.reload();
              }}
            />
          </SectionCard>
          <SectionCard
            id="my-campaigns"
            title="My campaigns"
            subtitle="Newest first"
            icon="chart"
            actions={
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => campaignsQ.reload()}>
                <Icon name="refresh" size={14} /> Refresh
              </button>
            }
          >
            <CampaignList campaignsQ={campaignsQ} pricing={pricing} onChanged={() => walletQ.reload()} />
          </SectionCard>
        </>
      ) : null}

      {tab === 'creatives' ? (
        <CreativesPanel
          creativesQ={creativesQ}
          onUseCreative={(c) => {
            setTab('campaigns');
            setTimeout(() => setUseCreativeId(c.id), 0);
          }}
        />
      ) : null}

      {tab === 'wallet' ? <WalletPanel walletQ={walletQ} pricing={pricing} onPaid={() => walletQ.reload()} /> : null}
    </DashboardShell>
  );
}
