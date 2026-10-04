export default function Spinner({ size = 20, className = '', label = 'Loading' }) {
  return (
    <span role="status" aria-live="polite" className={`inline-flex items-center ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className="animate-spin text-current"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
        <path d="M21.5 12a9.5 9.5 0 00-9.5-9.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function PageLoader({ label = 'Loading…' }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-primary">
      <Spinner size={32} />
      <p className="text-sm font-medium text-slate-500">{label}</p>
    </div>
  );
}
