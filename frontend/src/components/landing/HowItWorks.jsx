import { useEffect, useState } from 'react';
import Icon from '../common/Icon';

const STEPS = [
  { icon: 'utensils', title: 'Donor lists surplus', body: 'Restaurants, caterers and stores post surplus food in under a minute — items, quantity and expiry.' },
  { icon: 'sparkles', title: 'AI matches an NGO', body: 'Our engine scores nearby NGOs on distance, capacity, food fit and urgency, and offers the best match.' },
  { icon: 'truck', title: 'Volunteer picks up', body: 'The nearest available volunteer gets an optimised route and live GPS tracking for everyone.' },
  { icon: 'heart', title: 'Meals served', body: 'Food reaches people who need it, with a food-safety hand-over record and impact you can see.' },
];

/** 4-step animated explainer; the highlighted step advances automatically. */
export default function HowItWorks() {
  const [active, setActive] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setActive((a) => (a + 1) % STEPS.length), 3200);
    return () => clearInterval(id);
  }, []);

  return (
    <section id="how-it-works" className="scroll-mt-20 bg-white py-16 sm:py-20" aria-labelledby="how-title">
      <div className="container-page">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">How it works</p>
          <h2 id="how-title" className="mt-1 text-2xl font-extrabold sm:text-3xl">
            From surplus to sustenance in four steps
          </h2>
        </div>
        <ol className="relative mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <span className="absolute left-[12.5%] right-[12.5%] top-7 hidden h-0.5 bg-slate-200 lg:block" aria-hidden="true">
            <span
              className="block h-full bg-primary transition-[width] duration-700 ease-out"
              style={{ width: `${(active / (STEPS.length - 1)) * 100}%` }}
            />
          </span>
          {STEPS.map((s, i) => {
            const on = i <= active;
            return (
              <li
                key={s.title}
                className="relative animate-fade-up text-center"
                style={{ animationDelay: `${i * 120}ms` }}
                onMouseEnter={() => setActive(i)}
              >
                <span
                  className={`relative z-10 mx-auto flex h-14 w-14 items-center justify-center rounded-2xl transition-all duration-500 ${
                    on ? 'bg-primary text-white shadow-lg shadow-primary/30' : 'bg-primary-light text-primary'
                  } ${i === active ? 'scale-110' : ''}`}
                >
                  <Icon name={s.icon} size={26} />
                </span>
                <p className="mt-4 font-mono text-xs font-bold text-slate-400">STEP {i + 1}</p>
                <h3 className="mt-1 text-base font-bold">{s.title}</h3>
                <p className="mx-auto mt-2 max-w-xs text-sm text-slate-500">{s.body}</p>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
