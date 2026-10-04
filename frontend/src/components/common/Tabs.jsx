import Icon from './Icon';

/** Horizontally scrollable tab bar (works on mobile). tabs: [{value, label, icon?, count?}] */
export default function Tabs({ tabs, value, onChange, className = '', ariaLabel = 'Sections' }) {
  return (
    <div className={`scrollbar-none -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0 ${className}`}>
      <div role="tablist" aria-label={ariaLabel} className="inline-flex min-w-full gap-1 rounded-2xl bg-white p-1 shadow-card sm:min-w-0">
        {tabs.map((t) => {
          const active = t.value === value;
          return (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(t.value)}
              className={`inline-flex items-center gap-2 whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-primary/50 ${
                active ? 'bg-primary text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-dark'
              }`}
            >
              {t.icon ? <Icon name={t.icon} size={16} /> : null}
              {t.label}
              {t.count ? (
                <span
                  className={`rounded-full px-1.5 text-xs font-bold ${active ? 'bg-white/25 text-white' : 'bg-slate-100 text-slate-600'}`}
                >
                  {t.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
