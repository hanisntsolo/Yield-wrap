import { useState } from 'react';
import Icon from '../common/Icon';
import { initials } from '../../utils/formatters';
import { creativeImage } from './adUtils';

export const qrSrc = (data, size = 120) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(data || '')}`;

/**
 * Sticker mock-up for a creative. variant: 'round' | 'label'.
 * `imageSrc` overrides the creative image (e.g. a local upload preview). `qrUrl` renders a real QR, else a placeholder.
 */
export default function StickerPreview({ creative, imageSrc, variant = 'label', sponsor, qrUrl, size = 'md', className = '' }) {
  const [failed, setFailed] = useState(false);
  const src = imageSrc || creativeImage(creative);
  const showImg = src && !failed;
  const title = creative?.title || 'Your brand';
  const tagline = creative?.tagline;

  const qr = qrUrl ? (
    <img src={qrSrc(qrUrl)} alt="QR code" className="h-full w-full" loading="lazy" />
  ) : (
    <span className="grid h-full w-full grid-cols-3 gap-px p-0.5" aria-hidden="true">
      {[1, 0, 1, 0, 1, 0, 1, 1, 0].map((on, i) => (
        <span key={i} className={on ? 'bg-dark' : 'bg-white'} />
      ))}
    </span>
  );

  if (variant === 'round') {
    const dim = size === 'sm' ? 'h-28 w-28' : 'h-40 w-40';
    return (
      <div className={`relative flex ${dim} shrink-0 flex-col items-center justify-center overflow-hidden rounded-full border-4 border-dashed border-primary/40 bg-white p-3 text-center shadow-card ${className}`}>
        {showImg ? (
          <img src={src} alt={title} className="h-1/2 w-1/2 rounded-full object-cover" onError={() => setFailed(true)} />
        ) : (
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-extrabold text-white">{initials(title)}</span>
        )}
        <p className="mt-1 line-clamp-1 text-xs font-bold text-dark">{title}</p>
        {tagline ? <p className="line-clamp-1 text-[10px] text-slate-500">{tagline}</p> : null}
        <span className="absolute bottom-2 right-5 h-5 w-5 rounded-sm border border-slate-300 bg-white">{qr}</span>
      </div>
    );
  }

  return (
    <div className={`flex w-full max-w-xs items-stretch gap-3 overflow-hidden rounded-2xl border-2 border-dashed border-primary/40 bg-white p-3 shadow-card ${className}`}>
      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary-light">
        {showImg ? (
          <img src={src} alt={title} className="h-full w-full object-cover" onError={() => setFailed(true)} />
        ) : (
          <span className="text-lg font-extrabold text-primary">{initials(title)}</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-1 text-sm font-bold text-dark">{title}</p>
        {tagline ? <p className="line-clamp-2 text-xs text-slate-500">{tagline}</p> : null}
        <p className="mt-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-primary">
          <Icon name="heart" size={10} /> {sponsor ? `Sponsored by ${sponsor}` : 'Supports food rescue'}
        </p>
      </div>
      <span className="h-12 w-12 shrink-0 self-center rounded border border-slate-200 bg-white">{qr}</span>
    </div>
  );
}
