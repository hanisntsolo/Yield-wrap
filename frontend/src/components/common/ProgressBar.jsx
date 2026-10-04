/** Horizontal meter. `value` is 0..100. Tone auto-escalates with `autoTone` (capacity meters). */
export default function ProgressBar({ value, tone = 'primary', autoTone = false, className = '', height = 'h-2', label }) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  let color = { primary: 'bg-primary', accent: 'bg-accent', critical: 'bg-critical', blue: 'bg-[#2a78d6]' }[tone] || 'bg-primary';
  if (autoTone) color = pct >= 90 ? 'bg-critical' : pct >= 70 ? 'bg-accent' : 'bg-primary';
  return (
    <div
      className={`w-full overflow-hidden rounded-full bg-slate-100 ${height} ${className}`}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      aria-label={label}
    >
      <div className={`${height} rounded-full ${color} transition-[width] duration-500 ease-out`} style={{ width: `${pct}%` }} />
    </div>
  );
}
