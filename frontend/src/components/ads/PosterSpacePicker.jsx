import { useMemo, useState } from 'react';
import AddressInput from '../common/AddressInput';
import EmptyState from '../common/EmptyState';
import ErrorState from '../common/ErrorState';
import Icon from '../common/Icon';
import SegmentedControl from '../common/SegmentedControl';
import { SkeletonRows } from '../common/Skeleton';
import MapView from '../MapView';
import useFetch from '../../hooks/useFetch';
import { adMarketApi, asList } from '../../services/api';
import { formatDistance } from '../../utils/formatters';
import { toLatLng } from '../../utils/geo';
import { Credits } from './AdBadges';

const RADIUS_OPTIONS = [10, 25, 50, 100].map((r) => ({ value: r, label: `${r} km` }));

/** Browse NGO ad spaces near a location (list + map), pick one and a number of weeks. */
export default function PosterSpacePicker({ draft, set, errors, origin }) {
  const [where, setWhere] = useState(origin || { address: '', lat: null, lng: null });
  const [radius, setRadius] = useState(25);
  const ll = toLatLng(where);
  const q = useFetch(() => adMarketApi.spaces({ lat: ll?.lat, lng: ll?.lng, radiusKm: ll ? radius : undefined }), [ll?.lat, ll?.lng, radius]);
  const spaces = asList(q.data, 'spaces');

  const markers = useMemo(
    () =>
      spaces
        .map((s) => {
          const p = toLatLng(s.location);
          return p ? { id: s.id, ...p, type: 'ngo', label: s.name, description: `${s.ngo_name || ''} · ${s.credits_per_week} cr/week`, color: s.id === draft.space?.id ? '#F39C12' : undefined } : null;
        })
        .filter(Boolean),
    [spaces, draft.space?.id],
  );

  const choose = (s) => set('space', s);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <AddressInput id="space-near" label="Near" value={where} onChange={setWhere} hint="Search an area or use your location" />
        <SegmentedControl size="sm" ariaLabel="Search radius" options={RADIUS_OPTIONS} value={radius} onChange={setRadius} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="max-h-[360px] overflow-y-auto rounded-2xl border border-slate-200">
          {q.loading ? (
            <SkeletonRows rows={4} />
          ) : q.error && !q.data ? (
            <ErrorState error={q.error} onRetry={q.reload} compact />
          ) : !spaces.length ? (
            <EmptyState compact icon="building" title="No ad spaces here yet" description="Try a wider radius or a different area." />
          ) : (
            <ul className="divide-y divide-slate-100" role="radiogroup" aria-label="NGO ad spaces">
              {spaces.map((s) => {
                const on = draft.space?.id === s.id;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => choose(s)}
                      className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors ${on ? 'bg-primary-light' : 'hover:bg-slate-50'}`}
                    >
                      <Icon name={on ? 'check-circle' : 'building'} size={18} className={on ? 'mt-0.5 text-primary' : 'mt-0.5 text-slate-400'} />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-dark">
                          {s.name} {s.is_verified ? (
                            <span className="badge bg-primary-light text-primary ring-primary/20">
                              <Icon name="check" size={10} strokeWidth={3} /> Verified NGO
                            </span>
                          ) : null}
                        </span>
                        <span className="block truncate text-xs text-slate-500">
                          {s.ngo_name}
                          {s.size ? ` · ${s.size}` : ''}
                          {s.distance_km !== null && s.distance_km !== undefined ? ` · ${formatDistance(s.distance_km)}` : ''}
                        </span>
                        {s.description ? <span className="mt-0.5 line-clamp-2 block text-xs text-slate-500">{s.description}</span> : null}
                      </span>
                      <span className="shrink-0 text-right text-sm">
                        <Credits value={s.credits_per_week} />
                        <span className="block text-[10px] text-slate-400">per week</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <MapView markers={markers} center={ll || undefined} height={360} emptyMessage="No ad spaces to show" onMarkerClick={(m) => {
            const s = spaces.find((x) => x.id === m?.id);
            if (s) choose(s);
          }} />
      </div>
      {errors.space ? <p className="field-error">{errors.space}</p> : null}
      <div className="max-w-xs">
        <label className="label" htmlFor="cmp-weeks">
          Weeks <span className="text-critical">*</span>
        </label>
        <input id="cmp-weeks" type="number" min="1" max="12" inputMode="numeric" className={`input font-mono ${errors.weeks ? 'input-error' : ''}`} value={draft.weeks} onChange={(e) => set('weeks', e.target.value)} />
        {errors.weeks ? <p className="field-error">{errors.weeks}</p> : <p className="field-hint">1–12 weeks. The NGO confirms when the poster is up.</p>}
      </div>
    </div>
  );
}
