import { DONATION_STATUSES, TASK_STAGE_LABELS } from '../../utils/constants';
import { titleCase } from '../../utils/formatters';

export default function StatusBadge({ status, stage, className = '' }) {
  const meta = DONATION_STATUSES[status] || {
    label: titleCase(status) || 'Unknown',
    badge: 'bg-slate-100 text-slate-600 ring-slate-200',
    dot: 'bg-slate-400',
  };
  return (
    <span className={`badge ${meta.badge} ${className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} aria-hidden="true" />
      {meta.label}
      {stage && TASK_STAGE_LABELS[stage] && status !== 'delivered' ? (
        <span className="font-medium opacity-80">· {TASK_STAGE_LABELS[stage]}</span>
      ) : null}
    </span>
  );
}
