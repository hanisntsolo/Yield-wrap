import useNow from '../../hooks/useNow';
import { formatCountdown, msUntil } from '../../utils/formatters';
import Icon from './Icon';

/** Live countdown to `target` (ISO/Date). Colour shifts as the deadline approaches. */
export default function Countdown({ target, prefix, className = '', showIcon = true, criticalMinutes = 60, warnMinutes = 180 }) {
  const now = useNow(1000, Boolean(target));
  const ms = msUntil(target, now);
  if (ms === null) return <span className={`text-slate-400 ${className}`}>—</span>;
  const minutes = ms / 60000;
  const tone =
    ms <= 0
      ? 'text-critical'
      : minutes <= criticalMinutes
        ? 'text-critical'
        : minutes <= warnMinutes
          ? 'text-[#B9770E]'
          : 'text-slate-600';
  return (
    <span className={`inline-flex items-center gap-1 font-mono text-xs font-semibold tabular-nums ${tone} ${className}`}>
      {showIcon ? <Icon name="clock" size={13} /> : null}
      {prefix ? <span className="font-sans font-medium">{prefix}</span> : null}
      <time dateTime={typeof target === 'string' ? target : undefined}>{formatCountdown(ms)}</time>
    </span>
  );
}
