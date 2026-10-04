import { useEffect, useRef, useState } from 'react';
import { adsApi, apiUrl } from '../services/api';
import { ADSENSE_CLIENT, AD_SLOTS } from '../utils/constants';
import useMediaQuery from '../hooks/useMediaQuery';
import { initials } from '../utils/formatters';
import Icon from './common/Icon';

/**
 * Ad slot.  slot: 'leaderboard' (728x90) | 'rectangle' (300x250) | 'mobile' (320x50);  page: page identifier.
 * - VITE_ADSENSE_CLIENT set  -> Google AdSense unit.
 * - otherwise                -> built-in ad server (GET /api/ads/), impressions via IntersectionObserver,
 *                               clicks logged before the target opens in a new tab.
 * Reserves its box while loading and renders nothing when there is no ad.
 */
export default function AdBanner({ slot = 'rectangle', page = 'unknown', className = '', adsenseSlot }) {
  const size = AD_SLOTS[slot] || AD_SLOTS.rectangle;
  if (ADSENSE_CLIENT) return <AdSenseUnit size={size} className={className} adsenseSlot={adsenseSlot} />;
  return <HouseAd slot={slot} page={page} size={size} className={className} />;
}

/** Leaderboard on desktop only (>= lg). */
export function DesktopLeaderboardAd({ page, className = '' }) {
  const desktop = useMediaQuery('(min-width: 1024px)');
  if (!desktop) return null;
  return (
    <div className={`flex justify-center ${className}`}>
      <AdBanner slot="leaderboard" page={page} />
    </div>
  );
}

/** Mobile banner below lg. */
export function MobileBannerAd({ page, className = '' }) {
  const desktop = useMediaQuery('(min-width: 1024px)');
  if (desktop) return null;
  return (
    <div className={`flex justify-center ${className}`}>
      <AdBanner slot="mobile" page={page} />
    </div>
  );
}

/** Rectangle on desktop only (sidebar). */
export function SidebarRectangleAd({ page, className = '' }) {
  const desktop = useMediaQuery('(min-width: 1024px)');
  if (!desktop) return null;
  return <AdBanner slot="rectangle" page={page} className={className} />;
}

// ---------------------------------------------------------------- AdSense

let adsenseScriptLoaded = false;
function loadAdSenseScript() {
  if (adsenseScriptLoaded || typeof document === 'undefined') return;
  adsenseScriptLoaded = true;
  if (document.querySelector('script[data-yw-adsense]')) return;
  const s = document.createElement('script');
  s.async = true;
  s.crossOrigin = 'anonymous';
  s.dataset.ywAdsense = '1';
  s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(ADSENSE_CLIENT)}`;
  document.head.appendChild(s);
}

function AdSenseUnit({ size, className, adsenseSlot }) {
  const insRef = useRef(null);
  useEffect(() => {
    loadAdSenseScript();
    const el = insRef.current;
    if (!el || el.dataset.adsbygoogleStatus) return;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      /* blocked by an ad blocker – fine */
    }
  }, []);
  return (
    <div className={`mx-auto max-w-full overflow-hidden ${className}`} style={{ width: size.width, height: size.height }}>
      <ins
        ref={insRef}
        className="adsbygoogle"
        style={{ display: 'inline-block', width: size.width, height: size.height }}
        data-ad-client={ADSENSE_CLIENT}
        data-ad-slot={adsenseSlot || undefined}
      />
    </div>
  );
}

// ---------------------------------------------------------------- House ads

const safeUrl = (url) => (/^https?:\/\//i.test(String(url || '')) ? url : null);

function HouseAd({ slot, page, size, className }) {
  const [ad, setAd] = useState(null);
  const [state, setState] = useState('loading'); // loading | ready | empty
  const [imgFailed, setImgFailed] = useState(false);
  const boxRef = useRef(null);
  const logged = useRef(new Set());

  useEffect(() => {
    let active = true;
    setState('loading');
    setImgFailed(false);
    adsApi
      .get(slot, page)
      .then((res) => {
        if (!active) return;
        const next = res?.ad ?? null;
        setAd(next);
        setState(next ? 'ready' : 'empty');
      })
      .catch(() => active && setState('empty'));
    return () => {
      active = false;
    };
  }, [slot, page]);

  // One impression per ad per mount, once at least half of it is visible.
  useEffect(() => {
    if (state !== 'ready' || !ad?.id || !boxRef.current) return undefined;
    const log = () => {
      if (logged.current.has(ad.id)) return;
      logged.current.add(ad.id);
      adsApi.impression({ ad_id: ad.id, slot, page }).catch(() => {});
    };
    if (typeof IntersectionObserver === 'undefined') {
      log();
      return undefined;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          log();
          io.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    io.observe(boxRef.current);
    return () => io.disconnect();
  }, [state, ad?.id, slot, page]);

  if (state === 'empty') return null;

  const boxStyle = { width: size.width, maxWidth: '100%', height: size.height };

  if (state === 'loading') {
    return <div className={`skeleton mx-auto rounded-xl ${className}`} style={boxStyle} aria-hidden="true" />;
  }

  const url = safeUrl(ad.url);
  const onClick = () => {
    adsApi.click({ ad_id: ad.id, slot, page }).catch(() => {});
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  };
  const showImage = ad.image_url && !imgFailed;
  const sponsorLabel = ad.is_paid && ad.sponsor ? `Sponsored · ${ad.sponsor}` : 'Sponsored';

  return (
    <aside
      ref={boxRef}
      aria-label={`Sponsored by ${ad.sponsor || 'a partner'}`}
      className={`group relative mx-auto overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card ${className}`}
      style={boxStyle}
    >
      <button
        type="button"
        onClick={onClick}
        className="block h-full w-full text-left focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
        title={ad.title}
      >
        {showImage ? (
          <ImageAd ad={ad} slot={slot} onError={() => setImgFailed(true)} />
        ) : (
          <TextAd ad={ad} slot={slot} />
        )}
      </button>
      <span className="pointer-events-none absolute right-1.5 top-1.5 max-w-[60%] truncate rounded bg-dark/60 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider text-white">
        {sponsorLabel}
      </span>
    </aside>
  );
}

function ImageAd({ ad, slot, onError }) {
  return (
    <div className="relative h-full w-full">
      <img src={apiUrl(ad.image_url)} alt={ad.title || ad.sponsor || 'Advertisement'} className="h-full w-full object-cover" onError={onError} loading="lazy" />
      {slot !== 'mobile' ? (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-dark/80 to-transparent px-3 pb-2 pt-6 text-white">
          <p className="truncate text-xs font-semibold">{ad.title}</p>
          {ad.sponsor ? <p className="truncate text-[10px] opacity-80">by {ad.sponsor}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function SponsorMark({ sponsor, small }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-[#22965C] font-extrabold text-white ${
        small ? 'h-8 w-8 text-xs' : 'h-11 w-11 text-sm'
      }`}
      aria-hidden="true"
    >
      {initials(sponsor || 'Ad')}
    </span>
  );
}

function TextAd({ ad, slot }) {
  const cta = ad.cta || 'Learn more';
  if (slot === 'mobile') {
    return (
      <div className="flex h-full items-center gap-2 bg-gradient-to-r from-primary-light to-white px-2 pr-14">
        <SponsorMark sponsor={ad.sponsor} small />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-bold text-dark">{ad.title}</p>
          <p className="truncate text-[10px] text-slate-500">{ad.sponsor}</p>
        </div>
      </div>
    );
  }
  if (slot === 'leaderboard') {
    return (
      <div className="flex h-full items-center gap-4 bg-gradient-to-r from-primary-light via-white to-accent-light px-4 pr-20">
        <SponsorMark sponsor={ad.sponsor} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-dark">{ad.title}</p>
          {ad.body ? <p className="truncate text-xs text-slate-600">{ad.body}</p> : null}
          {ad.sponsor ? <p className="truncate text-[10px] font-medium text-slate-400">{ad.sponsor}</p> : null}
        </div>
        <span className="btn btn-primary btn-sm shrink-0 group-hover:bg-primary-dark">
          {cta} <Icon name="external" size={12} />
        </span>
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col bg-gradient-to-br from-primary-light via-white to-accent-light p-5">
      <div className="flex items-center gap-3">
        <SponsorMark sponsor={ad.sponsor} />
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold uppercase tracking-wide text-primary">{ad.category || 'Partner'}</p>
          <p className="truncate text-xs text-slate-500">{ad.sponsor}</p>
        </div>
      </div>
      <p className="mt-4 line-clamp-2 text-lg font-bold leading-snug text-dark">{ad.title}</p>
      {ad.body ? <p className="mt-1.5 line-clamp-3 text-sm text-slate-600">{ad.body}</p> : null}
      <span className="btn btn-primary btn-sm mt-auto self-start group-hover:bg-primary-dark">
        {cta} <Icon name="external" size={12} />
      </span>
    </div>
  );
}
