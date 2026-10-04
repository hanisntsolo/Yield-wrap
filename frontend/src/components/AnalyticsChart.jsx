import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CHART_COLORS } from '../utils/constants';
import { formatNumber } from '../utils/formatters';
import Skeleton from './common/Skeleton';
import EmptyState from './common/EmptyState';

const AXIS = { fontSize: 12, fill: '#64748B' };
const GRID = '#E8ECEE';
const INK = '#1C2833';

const defaultFormat = (v) => formatNumber(v, { decimals: 1 });
const compactTick = (v) => formatNumber(v, { compact: true, decimals: 1 });

function ChartTooltip({ active, payload, label, valueFormatter, labelFormatter }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
      {label !== undefined && label !== null ? (
        <p className="mb-1 font-semibold text-dark">{labelFormatter ? labelFormatter(label) : label}</p>
      ) : null}
      {payload.map((p) => (
        <p key={`${p.dataKey}-${p.name}`} className="flex items-center gap-2 text-slate-600">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: p.color || p.payload?.fill }} aria-hidden="true" />
          <span>{p.name}</span>
          <span className="ml-auto pl-3 font-mono font-semibold text-dark">{valueFormatter(p.value)}</span>
        </p>
      ))}
    </div>
  );
}

function DataTable({ data, xKey, series, xLabel, valueFormatter }) {
  return (
    <details className="mt-2 text-xs text-slate-500">
      <summary className="cursor-pointer select-none font-medium hover:text-dark">Show data table</summary>
      <div className="mt-2 max-h-56 overflow-auto rounded-lg border border-slate-100">
        <table className="table-base text-xs">
          <thead className="bg-slate-50">
            <tr>
              <th scope="col">{xLabel || xKey}</th>
              {series.map((s) => (
                <th key={s.key} scope="col" className="text-right">
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={i}>
                <td>{row[xKey] ?? '—'}</td>
                {series.map((s) => (
                  <td key={s.key} className="text-right font-mono">
                    {(s.format || valueFormatter)(row[s.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/**
 * Reusable chart.
 *   type:   'line' | 'bar' | 'hbar' | 'pie'
 *   data:   rows
 *   xKey:   category / x field (pie: slice name field)
 *   series: [{ key, label, color?, format? }]   (pie uses series[0] as the value)
 *   colorFor(row, index): optional per-row colour (bar/hbar/pie) so colour follows the entity, not its rank.
 */
export default function AnalyticsChart({
  type = 'line',
  data = [],
  xKey = 'date',
  series = [],
  height = 280,
  loading = false,
  valueFormatter = defaultFormat,
  xTickFormatter,
  labelFormatter,
  colorFor,
  emptyMessage = 'No data yet',
  xLabel,
  showTable = true,
  className = '',
}) {
  const rows = useMemo(() => (Array.isArray(data) ? data.filter(Boolean) : []), [data]);
  const resolvedSeries = useMemo(
    () => series.map((s, i) => ({ ...s, color: s.color || CHART_COLORS[i % CHART_COLORS.length] })),
    [series],
  );

  if (loading) return <Skeleton className={`w-full ${className}`} style={{ height }} />;
  if (!rows.length || !resolvedSeries.length) {
    return (
      <div className={`flex items-center justify-center ${className}`} style={{ minHeight: height }}>
        <EmptyState icon="chart" title={emptyMessage} compact />
      </div>
    );
  }

  const multi = resolvedSeries.length > 1;
  const tooltip = <Tooltip content={<ChartTooltip valueFormatter={valueFormatter} labelFormatter={labelFormatter} />} />;
  const legend = multi ? <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: INK, paddingTop: 8 }} /> : null;

  let chart = null;

  if (type === 'line') {
    chart = (
      <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey={xKey} tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} tickFormatter={xTickFormatter} minTickGap={24} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={compactTick} width={48} />
        <Tooltip
          cursor={{ stroke: '#94A3B8', strokeWidth: 1, strokeDasharray: '4 4' }}
          content={<ChartTooltip valueFormatter={valueFormatter} labelFormatter={labelFormatter || xTickFormatter} />}
        />
        {legend}
        {resolvedSeries.map((s) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={s.color}
            strokeWidth={2}
            dot={rows.length <= 12 ? { r: 3, strokeWidth: 2, fill: '#fff' } : false}
            activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }}
            isAnimationActive={rows.length < 120}
          />
        ))}
      </LineChart>
    );
  } else if (type === 'bar') {
    chart = (
      <BarChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -8 }} barCategoryGap="22%" barGap={2}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey={xKey} tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} tickFormatter={xTickFormatter} interval="preserveStartEnd" />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={compactTick} width={48} />
        {tooltip}
        {legend}
        {resolvedSeries.map((s) => (
          <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={44}>
            {colorFor && !multi ? rows.map((row, i) => <Cell key={i} fill={colorFor(row, i) || s.color} />) : null}
          </Bar>
        ))}
      </BarChart>
    );
  } else if (type === 'hbar') {
    const yWidth = Math.min(160, Math.max(80, ...rows.map((r) => String(r[xKey] ?? '').length * 7)));
    chart = (
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 4 }} barCategoryGap="24%">
        <CartesianGrid stroke={GRID} horizontal={false} />
        <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} tickFormatter={compactTick} />
        <YAxis
          type="category"
          dataKey={xKey}
          tick={{ ...AXIS, fill: INK }}
          tickLine={false}
          axisLine={{ stroke: GRID }}
          width={yWidth}
          tickFormatter={(v) => (String(v).length > 22 ? `${String(v).slice(0, 21)}…` : v)}
        />
        <Tooltip cursor={{ fill: 'rgba(26,122,74,0.06)' }} content={<ChartTooltip valueFormatter={valueFormatter} />} />
        {legend}
        {resolvedSeries.map((s) => (
          <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[0, 4, 4, 0]} maxBarSize={22}>
            {colorFor && !multi ? rows.map((row, i) => <Cell key={i} fill={colorFor(row, i) || s.color} />) : null}
          </Bar>
        ))}
      </BarChart>
    );
  } else if (type === 'pie') {
    const valueKey = resolvedSeries[0].key;
    const total = rows.reduce((sum, r) => sum + (Number(r[valueKey]) || 0), 0) || 1;
    const renderLabel = ({ percent }) => (percent >= 0.06 ? `${Math.round(percent * 100)}%` : '');
    chart = (
      <PieChart>
        <Pie
          data={rows}
          dataKey={valueKey}
          nameKey={xKey}
          innerRadius="52%"
          outerRadius="80%"
          paddingAngle={rows.length > 1 ? 1 : 0}
          stroke="#fff"
          strokeWidth={2}
          label={renderLabel}
          labelLine={false}
          isAnimationActive
        >
          {rows.map((row, i) => (
            <Cell key={i} fill={(colorFor && colorFor(row, i)) || CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          content={
            <ChartTooltip
              valueFormatter={(v) => `${valueFormatter(v)} (${Math.round(((Number(v) || 0) / total) * 100)}%)`}
            />
          }
        />
        <Legend iconType="circle" iconSize={8} layout="horizontal" verticalAlign="bottom" wrapperStyle={{ fontSize: 12, color: INK }} />
      </PieChart>
    );
  }

  return (
    <div className={className}>
      <div style={{ width: '100%', height }} role="img" aria-label={`${type} chart of ${resolvedSeries.map((s) => s.label).join(', ')}`}>
        <ResponsiveContainer width="100%" height="100%">
          {chart}
        </ResponsiveContainer>
      </div>
      {showTable ? (
        <DataTable data={rows} xKey={xKey} series={resolvedSeries} xLabel={xLabel} valueFormatter={valueFormatter} />
      ) : null}
    </div>
  );
}
