import Icon from './Icon';
import Skeleton from './Skeleton';

const TONES = {
  primary: 'bg-primary-light text-primary',
  accent: 'bg-accent-light text-[#B9770E]',
  critical: 'bg-critical-light text-critical',
  blue: 'bg-[#EAF2FB] text-[#21618C]',
  purple: 'bg-[#F4ECF7] text-[#76448A]',
  slate: 'bg-slate-100 text-slate-600',
};

export default function StatCard({ label, value, unit, icon = 'chart', tone = 'primary', hint, loading = false, className = '' }) {
  return (
    <div className={`card flex items-start gap-3 p-4 sm:p-5 ${className}`}>
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${TONES[tone] || TONES.primary}`}>
        <Icon name={icon} size={20} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        {loading ? (
          <Skeleton className="mt-2 h-7 w-20" />
        ) : (
          <p className="metric mt-1 truncate text-2xl text-dark">
            {value}
            {unit ? <span className="ml-1 text-sm font-semibold text-slate-500">{unit}</span> : null}
          </p>
        )}
        {hint ? <p className="mt-0.5 truncate text-xs text-slate-500">{hint}</p> : null}
      </div>
    </div>
  );
}
