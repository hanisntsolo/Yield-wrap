import { Link } from 'react-router-dom';
import Icon from '../common/Icon';
import { formatDateTime, formatNumber } from '../../utils/formatters';

/** "Packaging & stickers" block for a donation's `packaging` object. */
export default function PackagingSummary({ donation }) {
  const pk = donation?.packaging;
  if (!pk || !Number(pk.packet_count)) return null;
  const sponsored = Array.isArray(pk.sponsored) ? pk.sponsored : [];
  const sponsoredFilled = sponsored.reduce((s, x) => s + (Number(x?.packets) || 0), 0);
  const applied = pk.stickers_applied;
  return (
    <section className="rounded-2xl border border-accent/30 bg-accent-light/50 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-[#7E5109]">
          <Icon name="package" size={16} /> Packaging &amp; stickers
        </h3>
        {Number(pk.stickers_total) > 0 ? (
          <Link to={`/print/stickers/${donation.id}`} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">
            <Icon name="file" size={13} /> Sticker sheet
          </Link>
        ) : null}
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs text-slate-500">Packets</dt>
          <dd className="metric">{formatNumber(pk.packet_count)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Your ad</dt>
          <dd className="font-medium">{pk.own_ad ? <><span className="metric">{formatNumber(pk.own_ad.packets)}</span> · {pk.own_ad.title}</> : 'Off'}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Sponsored slots filled</dt>
          <dd className="metric">
            {formatNumber(sponsoredFilled)} / {formatNumber(pk.sponsored_capacity)}
          </dd>
        </div>
      </dl>
      {sponsored.length ? (
        <ul className="mt-3 space-y-1.5">
          {sponsored.map((s, i) => (
            <li key={s.campaign_id || i} className="flex items-center justify-between gap-2 rounded-lg bg-white/70 px-3 py-1.5 text-sm">
              <span className="min-w-0 truncate">
                {s.title} <span className="text-xs text-slate-500">· {s.owner_name}</span>
              </span>
              <span className="metric text-xs">{formatNumber(s.packets)}</span>
            </li>
          ))}
        </ul>
      ) : Number(pk.sponsored_capacity) > 0 ? (
        <p className="mt-2 text-xs text-slate-600">Sponsored slots are filled when an NGO accepts the donation.</p>
      ) : null}
      <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-600">
        <Icon name={applied ? 'check-circle' : 'clock'} size={13} className={applied ? 'text-primary' : ''} />
        {applied ? (
          <>
            <span className="metric">{formatNumber(applied.count)}</span> of <span className="metric">{formatNumber(pk.stickers_total)}</span> stickers applied · {formatDateTime(applied.applied_at)}
          </>
        ) : (
          <>Stickers are applied by the volunteer at pickup ({formatNumber(pk.stickers_total)} total).</>
        )}
      </p>
    </section>
  );
}
