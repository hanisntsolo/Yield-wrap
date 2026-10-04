import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import Icon from '../components/common/Icon';
import ErrorState from '../components/common/ErrorState';
import EmptyState from '../components/common/EmptyState';
import { PageLoader } from '../components/common/Spinner';
import Logo from '../components/common/Logo';
import { qrSrc } from '../components/ads/StickerPreview';
import { creativeImage, num } from '../components/ads/adUtils';
import { useAuth } from '../context/AuthContext';
import useFetch from '../hooks/useFetch';
import { adMarketApi } from '../services/api';
import { dashboardPathFor } from '../utils/constants';
import { formatNumber, initials } from '../utils/formatters';

const SCREEN_CAP = 200;
const PER_PAGE = 24; // 4 × 6 grid on A4

function Sticker({ s, sponsor }) {
  const c = s.creative || {};
  const img = creativeImage(c);
  return (
    <div className="sticker-cell">
      <div className="flex h-[38%] w-full items-center justify-center">
        {img ? (
          <img src={img} alt="" className="max-h-full max-w-[70%] rounded-md object-contain" />
        ) : (
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-extrabold text-white print:bg-black">{initials(c.title)}</span>
        )}
      </div>
      <p className="line-clamp-1 w-full text-[11px] font-extrabold leading-tight text-dark">{c.title}</p>
      {c.tagline ? <p className="line-clamp-2 w-full text-[8px] leading-tight text-slate-600">{c.tagline}</p> : null}
      {/* Centred so nothing falls into the clipped corners of the round label */}
      <div className="mt-auto flex w-full flex-col items-center gap-0.5">
        <img src={qrSrc(s.qr_url, 120)} alt="QR code" className="h-11 w-11" />
        <p className="line-clamp-1 max-w-[80%] text-center text-[7px] font-semibold uppercase leading-tight text-slate-500">
          {s.kind === 'own' ? 'Donated by' : 'Sponsored by'} <span className="text-dark">{sponsor}</span>
        </p>
      </div>
    </div>
  );
}

/** Printable A4 sticker sheet for a donation (GET /api/ads/stickers/{id}). */
export default function StickerSheet() {
  const { donationId } = useParams();
  const { user } = useAuth();
  const q = useFetch(() => adMarketApi.stickers(donationId), [donationId]);
  const stickers = Array.isArray(q.data?.stickers) ? q.data.stickers : [];
  const total = stickers.reduce((sum, s) => sum + Math.max(0, num(s.count)), 0);
  const copies = Math.max(1, Math.ceil(total / SCREEN_CAP));

  const pages = useMemo(() => {
    const cells = [];
    stickers.forEach((s, si) => {
      const n = Math.ceil(Math.max(0, num(s.count)) / copies);
      for (let i = 0; i < n; i += 1) cells.push({ s, key: `${si}-${i}` });
    });
    const out = [];
    for (let i = 0; i < cells.length; i += PER_PAGE) out.push(cells.slice(i, i + PER_PAGE));
    return out;
  }, [stickers, copies]);

  if (q.loading) return <PageLoader label="Loading sticker sheet…" />;

  const sponsorFor = (s) => (s.kind === 'own' ? q.data?.donor_name : s.creative?.owner_name || s.owner_name || s.creative?.title);

  return (
    <div className="mx-auto max-w-[210mm] px-4 py-6 print:p-0">
      <header className="no-print mb-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link to={dashboardPathFor(user?.role)} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-dark">
            <Icon name="chevron-left" size={16} /> Back
          </Link>
          <Logo />
        </div>
        {q.error && !q.data ? (
          <ErrorState error={q.error} onRetry={q.reload} title="Could not load the sticker sheet" />
        ) : (
          <div className="card card-pad space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-xl font-extrabold">Sticker sheet</h1>
                <p className="text-sm text-slate-500">
                  {q.data?.donor_name ? `${q.data.donor_name} · ` : ''}
                  <span className="font-mono">{formatNumber(q.data?.packet_count)}</span> packets ·{' '}
                  <span className="font-mono">{formatNumber(total)}</span> stickers
                </p>
              </div>
              <button type="button" className="btn btn-primary" onClick={() => window.print()} disabled={!total}>
                <Icon name="download" size={16} /> Print
              </button>
            </div>
            <ul className="flex flex-wrap gap-2 text-xs">
              {stickers.map((s, i) => (
                <li key={i} className={`badge ${s.kind === 'own' ? 'bg-primary-light text-primary ring-primary/20' : 'bg-accent-light text-[#B9770E] ring-accent/30'}`}>
                  {s.kind === 'own' ? 'Own' : 'Sponsored'} · {s.creative?.title} × <span className="font-mono">{formatNumber(s.count)}</span>
                </li>
              ))}
            </ul>
            {copies > 1 ? (
              <p className="flex items-start gap-2 rounded-xl bg-accent-light px-3 py-2 text-sm text-[#7E5109]">
                <Icon name="info" size={16} className="mt-0.5 shrink-0" />
                <span>
                  This sheet shows {formatNumber(pages.flat().length)} of {formatNumber(total)} stickers. Print <strong className="font-mono">{copies}</strong> copies to cover every packet.
                </span>
              </p>
            ) : null}
            <p className="text-xs text-slate-500">Use A4 sticker paper (4 × 6 labels, ~45 mm). Set margins to “None” or “Minimum” and scale to 100 %.</p>
          </div>
        )}
      </header>

      {!q.error && !total ? <EmptyState icon="package" title="No stickers for this donation" description="This donation has no stickers allocated yet." /> : null}

      {pages.map((cells, pi) => (
        <section key={pi} className="sticker-page" aria-label={`Sheet page ${pi + 1}`}>
          {cells.map(({ s, key }) => (
            <Sticker key={key} s={s} sponsor={sponsorFor(s)} />
          ))}
        </section>
      ))}
    </div>
  );
}
