import { useEffect, useRef, useState } from 'react';
import Icon from '../common/Icon';
import Skeleton from '../common/Skeleton';
import useFetch from '../../hooks/useFetch';
import useCountUp from '../../hooks/useCountUp';
import { analyticsApi } from '../../services/api';
import { formatNumber } from '../../utils/formatters';

const METRICS = [
  { key: 'kg_saved', label: 'Food rescued', unit: 'kg', icon: 'package', tone: 'text-primary bg-primary-light' },
  { key: 'meals_served', label: 'Meals served', unit: '', icon: 'utensils', tone: 'text-[#B9770E] bg-accent-light' },
  { key: 'active_ngos', label: 'Active NGOs', unit: '', icon: 'building', tone: 'text-[#21618C] bg-[#EAF2FB]' },
  { key: 'co2_saved_kg', label: 'CO₂ avoided', unit: 'kg', icon: 'leaf', tone: 'text-[#76448A] bg-[#F4ECF7]' },
];

/** Start the animation only once the counter scrolls into view. */
function useInView() {
  const ref = useRef(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setSeen(true);
      return undefined;
    }
    const io = new IntersectionObserver(([entry]) => entry.isIntersecting && setSeen(true), { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, seen];
}

function Metric({ metric, value, animate }) {
  const n = useCountUp(Number(value) || 0, { enabled: animate });
  return (
    <div className="card flex flex-col items-start gap-3 p-5">
      <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${metric.tone}`}>
        <Icon name={metric.icon} />
      </span>
      <p className="metric text-3xl text-dark sm:text-4xl">
        {formatNumber(Math.round(n), { compact: true, decimals: 1 })}
        {metric.unit ? <span className="ml-1 text-base font-semibold text-slate-500">{metric.unit}</span> : null}
      </p>
      <p className="text-sm font-medium text-slate-500">{metric.label}</p>
    </div>
  );
}

/** Live public impact numbers from GET /api/analytics/public-impact with an animated count-up. */
export default function ImpactCounter() {
  const { data, loading, error } = useFetch(() => analyticsApi.publicImpact(), [], { pollMs: 60000 });
  const [ref, seen] = useInView();

  return (
    <section id="impact" ref={ref} className="scroll-mt-20 py-16 sm:py-20" aria-labelledby="impact-title">
      <div className="container-page">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-primary">Live impact</p>
            <h2 id="impact-title" className="mt-1 text-2xl font-extrabold sm:text-3xl">
              Every kilogram counts
            </h2>
          </div>
          {!error && !loading ? (
            <span className="inline-flex items-center gap-2 text-xs font-medium text-primary">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
              </span>
              Updated live
            </span>
          ) : null}
        </div>
        {error && !data ? (
          <div className="card card-pad flex items-center gap-3 text-sm text-slate-600">
            <Icon name="info" className="text-primary" />
            Live numbers are taking a breather — our community keeps rescuing food every day. Check back in a moment.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {METRICS.map((m) =>
              loading && !data ? (
                <div key={m.key} className="card space-y-3 p-5">
                  <Skeleton className="h-10 w-10" />
                  <Skeleton className="h-9 w-24" />
                  <Skeleton className="h-4 w-20" />
                </div>
              ) : (
                <Metric key={m.key} metric={m} value={data?.[m.key]} animate={seen} />
              ),
            )}
          </div>
        )}
      </div>
    </section>
  );
}
