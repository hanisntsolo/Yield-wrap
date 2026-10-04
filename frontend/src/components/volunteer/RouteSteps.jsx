import Icon from '../common/Icon';
import { formatDistance, formatDuration } from '../../utils/formatters';

/** Turn-by-turn list from /api/ai/route `steps`: [{instruction, distance_km, duration_min}] */
export default function RouteSteps({ steps = [], loading, maxHeight = 'max-h-72' }) {
  const list = Array.isArray(steps) ? steps.filter(Boolean) : [];
  if (loading) {
    return (
      <div className="space-y-2" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton h-10 w-full" />
        ))}
      </div>
    );
  }
  if (!list.length) return <p className="text-sm text-slate-500">No turn-by-turn directions available — follow the map or open Google Maps.</p>;
  return (
    <ol className={`${maxHeight} space-y-1 overflow-y-auto pr-1`}>
      {list.map((s, i) => (
        <li key={i} className="flex items-start gap-3 rounded-xl px-2 py-2 hover:bg-surface">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-light font-mono text-[11px] font-bold text-primary">{i + 1}</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-dark">{typeof s === 'string' ? s : s.instruction || 'Continue'}</p>
            {typeof s === 'object' && (s.distance_km || s.duration_min) ? (
              <p className="mt-0.5 flex items-center gap-2 font-mono text-[11px] text-slate-500">
                <Icon name="route" size={12} /> {formatDistance(s.distance_km)}
                {s.duration_min ? <span>· {formatDuration(s.duration_min)}</span> : null}
              </p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
