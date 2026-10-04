import AddressInput from '../common/AddressInput';
import Switch from '../common/Switch';
import Icon from '../common/Icon';
import { formatNumber } from '../../utils/formatters';
import { hasCoords } from '../../utils/geo';

const RADII = [5, 10, 25, 50];

/** Packet sticker campaign: number of packets + optional geo target. */
export function PacketFields({ draft, set, errors, pricing, inventory }) {
  const targeted = Boolean(draft.targeted);
  return (
    <div className="space-y-4">
      <div>
        <label className="label" htmlFor="cmp-packets">
          Number of packets <span className="text-critical">*</span>
        </label>
        <input
          id="cmp-packets"
          type="number"
          min="1"
          max="100000"
          inputMode="numeric"
          className={`input font-mono ${errors.packets ? 'input-error' : ''}`}
          value={draft.packets}
          onChange={(e) => set('packets', e.target.value)}
        />
        {errors.packets ? (
          <p className="field-error">{errors.packets}</p>
        ) : (
          <p className="field-hint">
            {pricing?.costs?.packet_sticker} credits per packet. Open pool right now:{' '}
            <span className="font-mono font-semibold">{formatNumber(inventory?.open_pool_packets)}</span> packets.
          </p>
        )}
      </div>
      <Switch
        checked={targeted}
        onChange={(v) => set('targeted', v)}
        label="Target a location"
        description="Only fill packets picked up within a radius of a place, e.g. near your store."
      />
      {targeted ? (
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-surface/60 p-4">
          <AddressInput id="cmp-target" label="Target centre" required value={draft.target} onChange={(loc) => set('target', loc)} error={errors.target} />
          <div>
            <span className="label">Radius</span>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Target radius">
              {RADII.map((r) => (
                <button key={r} type="button" role="radio" aria-checked={Number(draft.radius_km) === r} onClick={() => set('radius_km', r)} className={`chip ${Number(draft.radius_km) === r ? 'chip-on' : 'chip-off'}`}>
                  {r} km
                </button>
              ))}
            </div>
          </div>
          {!hasCoords(draft.target) && draft.target?.address ? (
            <p className="flex items-center gap-1 text-xs text-[#B9770E]">
              <Icon name="info" size={12} /> Pick a suggestion so we can pin the location.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Digital campaign: impressions in steps of 1000. */
export function DigitalFields({ draft, set, errors, pricing }) {
  const n = Number(draft.impressions) || 0;
  const step = (d) => set('impressions', Math.min(1000000, Math.max(1000, n + d)));
  return (
    <div className="space-y-2">
      <label className="label" htmlFor="cmp-impr">
        Impressions <span className="text-critical">*</span>
      </label>
      <div className="flex items-center gap-2">
        <button type="button" className="btn btn-secondary" onClick={() => step(-1000)} aria-label="1,000 fewer impressions">
          <Icon name="minus" size={16} />
        </button>
        <input
          id="cmp-impr"
          type="number"
          min="1000"
          max="1000000"
          step="1000"
          inputMode="numeric"
          className={`input text-center font-mono ${errors.impressions ? 'input-error' : ''}`}
          value={draft.impressions}
          onChange={(e) => set('impressions', e.target.value)}
          onBlur={() => set('impressions', Math.min(1000000, Math.max(1000, Math.round((Number(draft.impressions) || 0) / 1000) * 1000)))}
        />
        <button type="button" className="btn btn-secondary" onClick={() => step(1000)} aria-label="1,000 more impressions">
          <Icon name="plus" size={16} />
        </button>
      </div>
      {errors.impressions ? (
        <p className="field-error">{errors.impressions}</p>
      ) : (
        <p className="field-hint">Multiples of 1,000 · {pricing?.costs?.digital_per_1000} credits per 1,000. Shown as “Sponsored” banners across dashboards.</p>
      )}
    </div>
  );
}
