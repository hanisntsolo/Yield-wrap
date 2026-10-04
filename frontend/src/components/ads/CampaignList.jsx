import { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import Icon from '../common/Icon';
import ConfirmDialog from '../common/ConfirmDialog';
import EmptyState from '../common/EmptyState';
import ErrorState from '../common/ErrorState';
import ProgressBar from '../common/ProgressBar';
import { SkeletonRows } from '../common/Skeleton';
import { adMarketApi, asList, errorMessage } from '../../services/api';
import { formatDate, formatNumber } from '../../utils/formatters';
import { BookingStatusBadge, CampaignStatusBadge, Credits } from './AdBadges';
import { CAMPAIGN_TYPE_META, campaignProgress, estimateRefund, num } from './adUtils';

export function CampaignRow({ c, onCancel, showOwner = false }) {
  const meta = CAMPAIGN_TYPE_META[c.type] || { label: c.type, icon: 'megaphone' };
  const prog = campaignProgress(c);
  return (
    <li className="space-y-3 px-4 py-4 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-light text-primary">
            <Icon name={meta.icon} size={17} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-dark">{c.creative?.title || 'Campaign'}</p>
            <p className="text-xs text-slate-500">
              {meta.label} · {formatDate(c.created_at, { year: 'numeric' })}
              {showOwner && c.owner_name ? ` · ${c.owner_name}` : ''}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {c.type === 'ngo_poster' && c.poster?.booking_status ? <BookingStatusBadge status={c.poster.booking_status} /> : null}
          <CampaignStatusBadge status={c.status} />
        </div>
      </div>
      <div>
        <div className="mb-1 flex flex-wrap justify-between gap-2 text-xs">
          <span className="font-mono text-slate-700">{prog.label}</span>
          <span className="text-slate-500">{prog.sub}</span>
        </div>
        <ProgressBar value={prog.pct} tone={c.type === 'digital' ? 'blue' : 'primary'} label={`${meta.label} progress`} />
        {c.type === 'ngo_poster' && c.poster?.starts_at ? (
          <p className="mt-1 text-xs text-slate-500">
            On display {formatDate(c.poster.starts_at)} – {formatDate(c.poster.ends_at)}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
        <span className="flex flex-wrap gap-x-4 gap-y-1">
          <span>
            Spent <Credits value={c.credits_spent} />
          </span>
          {num(c.credits_refunded) ? (
            <span>
              Refunded <Credits value={c.credits_refunded} />
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1">
            <Icon name="target" size={12} /> <span className="metric">{formatNumber(c.scans ?? 0)}</span> QR scans
          </span>
        </span>
        <span className="flex gap-2">
          {c.type === 'ngo_poster' ? (
            <Link to={`/print/poster/${c.id}`} target="_blank" className="btn btn-ghost btn-sm">
              <Icon name="file" size={13} /> Poster
            </Link>
          ) : null}
          {c.status === 'active' && onCancel ? (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onCancel(c)}>
              <Icon name="ban" size={13} /> Cancel
            </button>
          ) : null}
        </span>
      </div>
    </li>
  );
}

/** Own campaigns with progress + cancel (refund shown in the confirmation). */
export default function CampaignList({ campaignsQ, pricing, onChanged }) {
  const [toCancel, setToCancel] = useState(null);
  const campaigns = asList(campaignsQ.data, 'campaigns');

  const cancel = async () => {
    try {
      const updated = await adMarketApi.cancelCampaign(toCancel.id);
      toast.success(`Campaign cancelled${num(updated?.credits_refunded) ? ` · ${formatNumber(updated.credits_refunded)} credits refunded` : ''}`);
      campaignsQ.setData((d) => asList(d, 'campaigns').map((c) => (c.id === toCancel.id ? { ...c, ...(updated || {}), status: updated?.status || 'cancelled' } : c)));
      onChanged?.();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not cancel the campaign'));
      throw err;
    }
  };

  let body;
  if (campaignsQ.loading) body = <SkeletonRows rows={3} />;
  else if (campaignsQ.error && !campaignsQ.data) body = <ErrorState error={campaignsQ.error} onRetry={campaignsQ.reload} />;
  else if (!campaigns.length) body = <EmptyState icon="megaphone" title="No campaigns yet" description="Create your first campaign above. Credits are only spent when you launch." />;
  else
    body = (
      <ul className="divide-y divide-slate-100">
        {campaigns.map((c) => (
          <CampaignRow key={c.id} c={c} onCancel={setToCancel} />
        ))}
      </ul>
    );

  return (
    <>
      {body}
      <ConfirmDialog
        open={Boolean(toCancel)}
        onClose={() => setToCancel(null)}
        onConfirm={cancel}
        title="Cancel this campaign?"
        confirmLabel="Cancel campaign"
        cancelLabel="Keep running"
        message={
          <>
            <strong className="text-dark">{toCancel?.creative?.title}</strong> will stop running. Unused parts are refunded:
            <span className="mt-2 block rounded-lg bg-primary-light px-3 py-2 font-semibold text-primary">
              About <Credits value={estimateRefund(toCancel, pricing)} /> back to your wallet
            </span>
            <span className="mt-1 block text-xs text-slate-500">Packets already allocated to a pickup, displayed posters and served impressions are not refunded.</span>
          </>
        }
      />
    </>
  );
}
