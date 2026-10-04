/** items: [{ color, label }] */
export default function MapLegend({ items = [], className = '' }) {
  if (!items.length) return null;
  return (
    <ul className={`flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-600 ${className}`} aria-label="Map legend">
      {items.map((it) => (
        <li key={it.label} className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full border-2 border-white shadow ring-1 ring-slate-200" style={{ background: it.color }} />
          {it.label}
        </li>
      ))}
    </ul>
  );
}
