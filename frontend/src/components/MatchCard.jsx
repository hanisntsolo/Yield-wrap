import { formatDistance, titleCase, toPercentScore } from '../utils/formatters';
import Icon from './common/Icon';
import ScoreBadge from './common/ScoreBadge';
import ProgressBar from './common/ProgressBar';
import { PartnerName } from './common/VerifiedBadge';

const FACTOR_LABELS = {
  distance: 'Distance',
  proximity: 'Proximity',
  capacity: 'Capacity',
  food_type: 'Food type fit',
  food_compatibility: 'Food type fit',
  compatibility: 'Compatibility',
  urgency: 'Urgency',
  acceptance_rate: 'Acceptance rate',
  acceptance: 'Acceptance rate',
  demand: 'Demand',
  beneficiaries: 'Beneficiaries',
  operating_hours: 'Open now',
  load: 'Current load',
};

/** Normalise `breakdown` (object map or array) into [{label, pct}]. */
export function normalizeBreakdown(breakdown) {
  if (!breakdown) return [];
  const entries = Array.isArray(breakdown)
    ? breakdown.map((b) => [b?.factor ?? b?.name ?? b?.label ?? b?.key, b?.score ?? b?.value ?? b?.weighted])
    : Object.entries(breakdown).map(([k, v]) => [k, typeof v === 'object' && v !== null ? (v.score ?? v.value) : v]);
  return entries
    .map(([k, v]) => ({ key: String(k ?? ''), label: FACTOR_LABELS[k] || titleCase(k), pct: toPercentScore(v) }))
    .filter((e) => e.key && e.pct !== null);
}

export default function MatchCard({ match, rank, highlight = false, className = '' }) {
  if (!match) return null;
  const factors = normalizeBreakdown(match.breakdown);
  const best = rank === 1 || highlight;
  return (
    <article
      className={`card relative animate-fade-up p-4 transition-shadow hover:shadow-lg sm:p-5 ${best ? 'border-primary/40 ring-2 ring-primary/20' : ''} ${className}`}
      style={{ animationDelay: rank ? `${(rank - 1) * 80}ms` : undefined }}
    >
      <div className="flex items-start gap-3">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-mono text-sm font-bold ${
            best ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600'
          }`}
          aria-label={`Rank ${rank}`}
        >
          #{rank ?? '-'}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="min-w-0 text-sm font-semibold text-dark sm:text-base">
              <PartnerName name={match.organization_name || 'NGO'} ids={[match.ngo_id, match.user_id]} />
            </h3>
            <ScoreBadge score={match.score} size="lg" label="match" />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1">
              <Icon name="navigation" size={13} /> <span className="font-mono">{formatDistance(match.distance_km)}</span> away
            </span>
            {best ? (
              <span className="inline-flex items-center gap-1 font-semibold text-primary">
                <Icon name="sparkles" size={13} /> Best match — offer sent first
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {factors.length ? (
        <dl className="mt-4 grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
          {factors.map((f) => (
            <div key={f.key}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <dt className="text-slate-600">{f.label}</dt>
                <dd className="font-mono font-semibold text-dark">{Math.round(f.pct)}</dd>
              </div>
              <ProgressBar value={f.pct} height="h-1.5" label={`${f.label} score`} />
            </div>
          ))}
        </dl>
      ) : null}
    </article>
  );
}
