/** Small pill toggle group. options: [{value,label,activeClass?}] */
export default function SegmentedControl({ options, value, onChange, ariaLabel, size = 'md', className = '' }) {
  const pad = size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-2 text-sm';
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={`inline-flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1 ${className}`}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`rounded-lg font-semibold transition-all focus-visible:ring-2 focus-visible:ring-primary/50 ${pad} ${
              active ? o.activeClass || 'bg-white text-dark shadow-sm' : 'text-slate-600 hover:text-dark'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
