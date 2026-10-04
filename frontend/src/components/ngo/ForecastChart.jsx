import AnalyticsChart from '../AnalyticsChart';
import ErrorState from '../common/ErrorState';
import Icon from '../common/Icon';
import useFetch from '../../hooks/useFetch';
import { aiApi, asList } from '../../services/api';
import { formatDate, formatKg, formatPercent, formatRelativeTime, toPercentScore } from '../../utils/formatters';

const SOURCE_LABELS = { random_forest: 'Random forest model', baseline: 'Baseline average' };

/** 7-day demand forecast (bar) with per-day confidence and the model source. */
export default function ForecastChart({ days = 7 }) {
  const { data, loading, error, reload } = useFetch(() => aiApi.forecast(days), [days], { pollMs: 10 * 60000 });
  const rows = asList(data?.forecast).map((r) => ({
    ...r,
    label: formatDate(r.date, { weekday: 'short', day: 'numeric' }),
    predicted_kg: Number(r.predicted_kg) || 0,
  }));
  const model = data?.model || {};
  const confidences = rows.map((r) => toPercentScore(r.confidence)).filter((c) => c !== null);
  const avgConfidence = confidences.length ? confidences.reduce((a, b) => a + b, 0) / confidences.length : null;
  const total = rows.reduce((s, r) => s + r.predicted_kg, 0);

  if (error) return <ErrorState error={error} onRetry={reload} compact title="Forecast unavailable" />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className={`badge ${model.source === 'random_forest' ? 'bg-primary-light text-primary ring-primary/20' : 'bg-slate-100 text-slate-600 ring-slate-200'}`}>
          <Icon name="sparkles" size={12} /> {SOURCE_LABELS[model.source] || model.source || 'Model'}
        </span>
        {avgConfidence !== null ? (
          <span className="badge bg-[#EAF2FB] text-[#21618C] ring-[#2a78d6]/20">Avg. confidence {formatPercent(avgConfidence, { fraction: false })}</span>
        ) : null}
        {model.samples ? <span className="text-slate-500">{model.samples} training samples</span> : null}
        {model.trained_at ? <span className="text-slate-500">· trained {formatRelativeTime(model.trained_at)}</span> : null}
        {rows.length ? (
          <span className="ml-auto text-slate-500">
            Next {days} days: <span className="font-mono font-semibold text-dark">{formatKg(total)}</span>
          </span>
        ) : null}
      </div>
      <AnalyticsChart
        type="bar"
        data={rows}
        xKey="label"
        xLabel="Day"
        series={[{ key: 'predicted_kg', label: 'Predicted demand', color: '#1A7A4A' }]}
        valueFormatter={(v) => formatKg(v)}
        loading={loading}
        height={240}
        emptyMessage="Not enough history for a forecast yet"
        showTable={false}
      />
      {rows.length ? (
        <ul className="grid grid-cols-4 gap-1.5 text-center sm:grid-cols-7" aria-label="Forecast confidence by day">
          {rows.map((r) => {
            const c = toPercentScore(r.confidence);
            return (
              <li key={r.date} className="rounded-lg bg-surface px-1 py-1.5">
                <p className="text-[10px] font-medium text-slate-500">{r.label}</p>
                <p className="font-mono text-xs font-semibold text-dark">{formatKg(r.predicted_kg)}</p>
                <p className="font-mono text-[10px] text-slate-500">{c === null ? '—' : `${Math.round(c)}% conf.`}</p>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
