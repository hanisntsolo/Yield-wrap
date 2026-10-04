import { useId } from 'react';
import Spinner from './Spinner';

export default function Switch({ checked, onChange, label, description, disabled = false, busy = false, className = '' }) {
  const id = useId();
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={Boolean(checked)}
        aria-label={typeof label === 'string' ? label : undefined}
        disabled={disabled || busy}
        onClick={() => onChange?.(!checked)}
        className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${
          checked ? 'bg-primary' : 'bg-slate-300'
        }`}
      >
        <span
          className={`flex h-5 w-5 items-center justify-center rounded-full bg-white text-primary shadow transition-transform ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
        >
          {busy ? <Spinner size={12} /> : null}
        </span>
      </button>
      {label || description ? (
        <label htmlFor={id} className="cursor-pointer select-none">
          {label ? <span className="block text-sm font-semibold text-dark">{label}</span> : null}
          {description ? <span className="block text-xs text-slate-500">{description}</span> : null}
        </label>
      ) : null}
    </div>
  );
}
