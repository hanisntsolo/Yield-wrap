import { Link } from 'react-router-dom';
import Icon from '../common/Icon';
import Switch from '../common/Switch';
import Skeleton from '../common/Skeleton';
import useFetch from '../../hooks/useFetch';
import { adMarketApi, asList } from '../../services/api';
import { formatNumber, formatPercent } from '../../utils/formatters';
import { normalizePricing, packetSplit } from './adUtils';
import StickerPreview from './StickerPreview';

/**
 * Donation form block: packet count + "put my ad on X% of packets (free)" with an approved-creative picker.
 * value: { packets: string, ownAd: bool, creativeId: string }
 */
export default function PackagingFields({ value, onChange, errors = {} }) {
  const set = (patch) => onChange({ ...value, ...patch });
  const pricingQ = useFetch(() => adMarketApi.pricing(), []);
  const creativesQ = useFetch(() => adMarketApi.creatives(), [], { enabled: Boolean(value.ownAd) });
  const ownShare = normalizePricing(pricingQ.data).own_share;
  const approved = asList(creativesQ.data, 'creatives').filter((c) => c.status === 'approved');
  const split = packetSplit(value.packets, ownShare, value.ownAd && Boolean(value.creativeId));
  const selected = approved.find((c) => c.id === value.creativeId);
  const pct = formatPercent(ownShare);

  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-surface/60 p-4">
      <div className="grid gap-4 sm:grid-cols-[10rem_minmax(0,1fr)] sm:items-start">
        <div>
          <label className="label" htmlFor="packet-count">
            Packets <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <input
            id="packet-count"
            type="number"
            min="0"
            max="100000"
            step="1"
            inputMode="numeric"
            className={`input font-mono ${errors.packet_count ? 'input-error' : ''}`}
            placeholder="0"
            value={value.packets}
            onChange={(e) => set({ packets: e.target.value })}
          />
          {errors.packet_count ? <p className="field-error">{errors.packet_count}</p> : null}
        </div>
        <div className="pt-0 sm:pt-7">
          <Switch
            checked={Boolean(value.ownAd)}
            onChange={(on) => set({ ownAd: on })}
            disabled={!split.total}
            label={`Put my ad on ${pct} of packets (free)`}
            description={split.total ? 'Volunteers apply your sticker at pickup.' : 'Enter the number of packets first.'}
          />
        </div>
      </div>

      {value.ownAd && split.total ? (
        creativesQ.loading ? (
          <Skeleton className="h-11 w-full" />
        ) : approved.length ? (
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
            <div>
              <label className="label" htmlFor="own-creative">
                Your sticker design
              </label>
              <select id="own-creative" className={`input ${errors.own_ad_creative_id ? 'input-error' : ''}`} value={value.creativeId || ''} onChange={(e) => set({ creativeId: e.target.value })}>
                <option value="">Choose an approved creative…</option>
                {approved.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
              {errors.own_ad_creative_id ? <p className="field-error">{errors.own_ad_creative_id}</p> : null}
            </div>
            {selected ? <StickerPreview creative={selected} /> : null}
          </div>
        ) : (
          <p className="flex flex-wrap items-center gap-2 rounded-xl bg-accent-light px-3 py-2 text-sm text-[#7E5109]">
            <Icon name="info" size={15} /> You have no approved creatives yet.
            <Link to="/advertising?tab=creatives" className="font-semibold text-primary hover:underline">
              Upload one <Icon name="arrow-right" size={12} />
            </Link>
          </p>
        )
      ) : null}

      {split.total ? (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-600" aria-live="polite">
          <Icon name="package" size={15} className="text-primary" />
          {split.own ? (
            <>
              <span>
                <strong className="font-mono text-dark">{formatNumber(split.own)}</strong> packets with your ad
              </span>
              <span aria-hidden="true">·</span>
            </>
          ) : null}
          <span>
            <strong className="font-mono text-dark">{formatNumber(split.sponsored)}</strong> sponsored slots for other advertisers
          </span>
        </p>
      ) : null}
    </div>
  );
}
