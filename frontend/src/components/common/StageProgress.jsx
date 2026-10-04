import { TASK_STAGES, TASK_STAGE_ORDER } from '../../utils/constants';
import Icon from './Icon';

/** Horizontal stepper of the delivery lifecycle (accepted -> at pickup -> collected -> delivered). */
export default function StageProgress({ stage, status, compact = false }) {
  const steps = TASK_STAGES.filter((s) => s.value !== 'assigned');
  const current = status === 'delivered' ? TASK_STAGE_ORDER.indexOf('delivered') : TASK_STAGE_ORDER.indexOf(stage);
  return (
    <ol className="flex w-full items-start" aria-label="Delivery progress">
      {steps.map((s, i) => {
        const idx = TASK_STAGE_ORDER.indexOf(s.value);
        const done = current >= idx;
        const active = current === idx;
        return (
          <li key={s.value} className="relative flex flex-1 flex-col items-center text-center">
            {i > 0 ? (
              <span
                className={`absolute right-1/2 top-3 h-0.5 w-full -translate-y-1/2 ${current >= idx ? 'bg-primary' : 'bg-slate-200'}`}
                aria-hidden="true"
              />
            ) : null}
            <span
              className={`relative z-10 flex h-6 w-6 items-center justify-center rounded-full border-2 text-[10px] font-bold ${
                done ? 'border-primary bg-primary text-white' : 'border-slate-300 bg-white text-slate-400'
              } ${active ? 'ring-4 ring-primary/20' : ''}`}
            >
              {done ? <Icon name="check" size={12} strokeWidth={3} /> : i + 1}
            </span>
            {!compact ? (
              <span className={`mt-1.5 text-[11px] font-medium leading-tight ${done ? 'text-dark' : 'text-slate-400'}`}>{s.label}</span>
            ) : null}
            <span className="sr-only">{done ? 'completed' : 'pending'}</span>
          </li>
        );
      })}
    </ol>
  );
}
