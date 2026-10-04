import { Link, useParams } from 'react-router-dom';
import Icon from '../components/common/Icon';
import ErrorState from '../components/common/ErrorState';
import EmptyState from '../components/common/EmptyState';
import { PageLoader } from '../components/common/Spinner';
import { LogoMark } from '../components/common/Logo';
import { qrSrc } from '../components/ads/StickerPreview';
import { creativeImage } from '../components/ads/adUtils';
import { useAuth } from '../context/AuthContext';
import useFetch from '../hooks/useFetch';
import { adMarketApi, asList, ngoAdsApi } from '../services/api';
import { API_URL, dashboardPathFor } from '../utils/constants';
import { initials } from '../utils/formatters';

/** Printable A4 poster for an NGO poster campaign (NGO host or advertiser). */
export default function PosterPrint() {
  const { campaignId } = useParams();
  const { user } = useAuth();
  const q = useFetch(async () => {
    const list = user?.role === 'ngo' ? await ngoAdsApi.bookings() : await adMarketApi.campaigns();
    return asList(list, 'campaigns', 'bookings').find((c) => String(c.id) === String(campaignId)) || null;
  }, [campaignId, user?.role]);

  if (q.loading) return <PageLoader label="Loading poster…" />;
  const c = q.data;
  const cr = c?.creative || {};
  const img = creativeImage(cr);
  const scanUrl = c?.creative_id ? `${API_URL}/api/ads/s/${encodeURIComponent(c.creative_id)}` : cr.url;

  return (
    <div className="mx-auto max-w-[210mm] px-4 py-6 print:p-0">
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link to={dashboardPathFor(user?.role)} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-dark">
          <Icon name="chevron-left" size={16} /> Back
        </Link>
        {c ? (
          <button type="button" className="btn btn-primary" onClick={() => window.print()}>
            <Icon name="download" size={16} /> Print poster
          </button>
        ) : null}
      </div>
      {q.error && !q.data ? <ErrorState error={q.error} onRetry={q.reload} title="Could not load this poster" /> : null}
      {!q.error && !c ? <EmptyState icon="file" title="Poster not found" description="This booking may have been cancelled or belongs to another account." /> : null}
      {c ? (
        <article className="poster-page flex flex-col items-center justify-between rounded-3xl border-8 border-primary p-10 text-center print:rounded-none">
          <div className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-widest text-slate-500">
            <span>Sponsored by {c.owner_name}</span>
            <span>{c.poster?.ngo_name}</span>
          </div>
          <div className="flex flex-1 flex-col items-center justify-center gap-6 py-8">
            {img ? (
              <img src={img} alt={cr.title} className="max-h-[110mm] max-w-full object-contain" />
            ) : (
              <span className="flex h-40 w-40 items-center justify-center rounded-full bg-primary text-5xl font-extrabold text-white">{initials(cr.title)}</span>
            )}
            <h1 className="text-5xl font-extrabold leading-tight text-dark">{cr.title}</h1>
            {cr.tagline ? <p className="max-w-lg text-2xl text-slate-600">{cr.tagline}</p> : null}
          </div>
          <div className="flex w-full items-end justify-between gap-6">
            <div className="flex items-center gap-3 text-left">
              <LogoMark size={44} />
              <p className="text-sm text-slate-600">
                Proudly supporting food rescue
                <br />
                with <strong className="text-dark">YIELD WRAP</strong>
              </p>
            </div>
            {scanUrl ? (
              <div className="text-center">
                <img src={qrSrc(scanUrl, 240)} alt="QR code" className="h-32 w-32" />
                <p className="mt-1 text-[10px] uppercase tracking-wider text-slate-500">Scan me</p>
              </div>
            ) : null}
          </div>
        </article>
      ) : null}
    </div>
  );
}
