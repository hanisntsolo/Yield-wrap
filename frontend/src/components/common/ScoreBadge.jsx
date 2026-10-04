import { toPercentScore } from '../../utils/formatters';
import Icon from './Icon';

/** AI score pill (accepts 0..1 or 0..100). */
export default function ScoreBadge({ score, label = 'AI match', size = 'md', className = '' }) {
  const pct = toPercentScore(score);
  if (pct === null) return null;
  const tone =
    pct >= 75
      ? 'bg-primary text-white ring-primary'
      : pct >= 50
        ? 'bg-primary-light text-primary ring-primary/30'
        : 'bg-accent-light text-[#B9770E] ring-accent/30';
  const sz = size === 'lg' ? 'px-3 py-1 text-sm' : '';
  return (
    <span className={`badge ${tone} ${sz} ${className}`} title={`${label} score: ${Math.round(pct)} / 100`}>
      <Icon name="sparkles" size={size === 'lg' ? 14 : 12} strokeWidth={2} />
      <span className="font-mono">{Math.round(pct)}</span>
      {size === 'lg' ? <span className="font-medium opacity-90">{label}</span> : null}
    </span>
  );
}
