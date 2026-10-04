import Icon from '../common/Icon';
import SectionCard from '../common/SectionCard';
import EmptyState from '../common/EmptyState';
import ErrorState from '../common/ErrorState';
import Skeleton, { SkeletonRows } from '../common/Skeleton';
import { formatDateTime, formatINR, formatPercent, titleCase } from '../../utils/formatters';
import CreditPacks from './CreditPacks';
import { Credits } from './AdBadges';
import { creditsToInr, num, TX_META } from './adUtils';

function Balance({ wallet, pricing, loading }) {
  const credits = num(wallet?.credits);
  return (
    <div className="rounded-2xl bg-gradient-to-br from-primary to-[#22965C] p-5 text-white shadow-card sm:p-6">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-white/80">
        <Icon name="zap" size={14} /> Ad credit balance
      </p>
      {loading ? (
        <Skeleton className="mt-3 h-10 w-40 bg-white/30" />
      ) : (
        <p className="metric mt-2 text-4xl">
          {credits.toLocaleString('en-IN')} <span className="text-base font-semibold text-white/80">credits</span>
        </p>
      )}
      <p className="mt-1 font-mono text-sm text-white/90">≈ {formatINR(creditsToInr(credits, pricing))} value</p>
      {num(wallet?.earnings_credits) > 0 ? (
        <p className="mt-2 text-xs text-white/80">
          Earnings: <Credits value={wallet.earnings_credits} className="text-white" />
        </p>
      ) : null}
    </div>
  );
}

function PricingExplainer({ pricing }) {
  const c = pricing?.costs || {};
  const rows = [
    { icon: 'package', label: 'Packet sticker', value: `${c.packet_sticker} cr / packet` },
    { icon: 'building', label: 'NGO poster', value: `from ${c.ngo_poster_week_default} cr / week` },
    { icon: 'megaphone', label: 'Digital', value: `${c.digital_per_1000} cr / 1,000 views` },
  ];
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-sm font-bold text-dark">How pricing works</p>
      <p className="mt-1 text-xs text-slate-500">
        1 credit = {formatINR(pricing?.credit_value_inr)}. Donors get {formatPercent(pricing?.own_share)} of their packets stickered free; NGOs earn{' '}
        {formatPercent(pricing?.ngo_revenue_share)} of sponsored spend.
      </p>
      <ul className="mt-3 space-y-2">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-2 text-sm">
            <Icon name={r.icon} size={15} className="text-primary" />
            <span className="flex-1 text-slate-600">{r.label}</span>
            <span className="font-mono text-xs font-semibold text-dark">{r.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Transactions({ wallet, loading, error, onRetry }) {
  const txs = Array.isArray(wallet?.transactions) ? wallet.transactions : [];
  if (loading) return <SkeletonRows rows={4} />;
  if (error && !wallet) return <ErrorState error={error} onRetry={onRetry} compact />;
  if (!txs.length) return <EmptyState compact icon="file" title="No transactions yet" description="Buy a credit pack to get started." />;
  return (
    <ul className="divide-y divide-slate-100">
      {txs.map((t) => {
        const meta = TX_META[t.type] || { label: titleCase(t.type), tone: 'text-slate-600', icon: 'info' };
        const amt = num(t.credits);
        return (
          <li key={t.id} className="flex items-center gap-3 px-4 py-3 sm:px-6">
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 ${meta.tone}`}>
              <Icon name={meta.icon} size={15} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-dark">{t.note || meta.label}</p>
              <p className="text-xs text-slate-500">
                {meta.label} · {formatDateTime(t.created_at)}
              </p>
            </div>
            <div className="text-right">
              <p className={`metric text-sm ${amt < 0 ? 'text-critical' : 'text-primary'}`}>
                {amt > 0 ? '+' : ''}
                {amt.toLocaleString('en-IN')}
              </p>
              <p className="font-mono text-[11px] text-slate-400">bal {num(t.balance_after).toLocaleString('en-IN')}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Wallet tab: balance, pricing, credit packs and transaction history. */
export default function WalletPanel({ walletQ, pricing, onPaid }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <Balance wallet={walletQ.data} pricing={pricing} loading={walletQ.loading} />
        <PricingExplainer pricing={pricing} />
      </div>
      <SectionCard id="buy-credits" title="Buy credits" subtitle="One-time packs, no subscription" icon="zap" bodyClassName="card-pad">
        <CreditPacks pricing={pricing} onPaid={onPaid} />
      </SectionCard>
      <SectionCard id="transactions" title="Transaction history" subtitle="Latest 50 entries" icon="file">
        <Transactions wallet={walletQ.data} loading={walletQ.loading} error={walletQ.error} onRetry={walletQ.reload} />
      </SectionCard>
    </div>
  );
}
