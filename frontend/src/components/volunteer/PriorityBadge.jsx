import { toPercentScore } from '../../utils/formatters';

const TIERS = [
  { min: 75, label: 'P1', name: 'Urgent', className: 'bg-critical text-white ring-critical' },
  { min: 50, label: 'P2', name: 'High', className: 'bg-urgency-high/15 text-[#AF601A] ring-urgency-high/30' },
  { min: 25, label: 'P3', name: 'Normal', className: 'bg-[#EAF2FB] text-[#21618C] ring-[#2a78d6]/20' },
  { min: -1, label: 'P4', name: 'Low', className: 'bg-slate-100 text-slate-600 ring-slate-200' },
];

export function priorityTier(score) {
  const pct = toPercentScore(score);
  if (pct === null) return null;
  return { ...TIERS.find((t) => pct >= t.min), pct };
}

export default function PriorityBadge({ score, className = '' }) {
  const tier = priorityTier(score);
  if (!tier) return null;
  return (
    <span className={`badge ${tier.className} ${className}`} title={`Priority score ${Math.round(tier.pct)} / 100`}>
      <span className="font-mono">{tier.label}</span>
      {tier.name}
      <span className="font-mono opacity-80">{Math.round(tier.pct)}</span>
    </span>
  );
}
