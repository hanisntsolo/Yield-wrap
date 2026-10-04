import { URGENCY_META } from '../../utils/constants';
import Icon from './Icon';

export default function UrgencyBadge({ level, className = '' }) {
  const meta = URGENCY_META[level];
  if (!meta) return null;
  return (
    <span className={`badge ${meta.badge} ${className}`} title={`Urgency: ${meta.label}`}>
      {level === 'critical' || level === 'high' ? <Icon name="zap" size={12} strokeWidth={2.2} /> : null}
      {meta.label}
    </span>
  );
}
