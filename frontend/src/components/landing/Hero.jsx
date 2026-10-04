import { Link } from 'react-router-dom';
import Icon from '../common/Icon';

const CTAS = [
  { role: 'donor', label: 'Donate Food', icon: 'utensils', className: 'btn-primary' },
  { role: 'ngo', label: 'Join as NGO', icon: 'building', className: 'btn-accent' },
  { role: 'volunteer', label: 'Volunteer', icon: 'truck', className: 'btn-secondary' },
];

const WORDS = [
  { text: 'Surplus Today.', className: 'text-dark' },
  { text: 'Sustenance Tomorrow.', className: 'bg-gradient-to-r from-primary to-[#22965C] bg-clip-text text-transparent' },
];

export default function Hero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-primary-light via-white to-surface">
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-accent/20 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -left-24 top-40 h-72 w-72 rounded-full bg-primary/15 blur-3xl" aria-hidden="true" />
      <div className="container-page relative grid items-center gap-10 py-14 sm:py-20 lg:grid-cols-[1.1fr_0.9fr] lg:py-24">
        <div>
          <span className="badge animate-fade-up bg-white text-primary ring-primary/20">
            <Icon name="sparkles" size={12} /> AI-powered food redistribution
          </span>
          <h1 className="mt-5 text-4xl font-extrabold leading-[1.08] sm:text-5xl lg:text-6xl">
            {WORDS.map((w, i) => (
              <span key={w.text} className={`block animate-fade-up ${w.className}`} style={{ animationDelay: `${150 + i * 250}ms` }}>
                {w.text}
              </span>
            ))}
          </h1>
          <p className="mt-5 max-w-xl animate-fade-up text-base text-slate-600 sm:text-lg" style={{ animationDelay: '650ms' }}>
            YIELD WRAP connects surplus food from restaurants and stores with NGOs in real time — matched by AI,
            delivered by volunteers, tracked live from pickup to plate.
          </p>
          <div className="mt-8 flex animate-fade-up flex-col gap-3 sm:flex-row" style={{ animationDelay: '800ms' }}>
            {CTAS.map((c) => (
              <Link key={c.role} to={`/register?role=${c.role}`} className={`btn btn-lg ${c.className}`}>
                <Icon name={c.icon} size={18} /> {c.label}
              </Link>
            ))}
          </div>
          <p className="mt-4 text-sm text-slate-500">
            Already part of the network?{' '}
            <Link to="/login" className="font-semibold text-primary hover:underline">
              Log in
            </Link>
          </p>
        </div>

        <div className="relative hidden animate-fade-up sm:block" style={{ animationDelay: '400ms' }} aria-hidden="true">
          <div className="card relative mx-auto max-w-md p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-dark">Live delivery</span>
              <span className="badge bg-status-in_transit/15 text-[#76448A] ring-status-in_transit/30">In transit</span>
            </div>
            <div className="mt-4 space-y-3">
              {[
                { icon: 'utensils', label: 'Green Bowl Café', sub: '18 kg cooked meals · pickup', tone: 'bg-accent-light text-[#B9770E]' },
                { icon: 'truck', label: 'Asha (bike)', sub: 'ETA 12 min', tone: 'bg-[#EAF2FB] text-[#21618C]' },
                { icon: 'building', label: 'Hope Shelter', sub: 'AI match score 92', tone: 'bg-primary-light text-primary' },
              ].map((r) => (
                <div key={r.label} className="flex items-center gap-3 rounded-xl bg-surface p-3">
                  <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${r.tone}`}>
                    <Icon name={r.icon} size={18} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-dark">{r.label}</p>
                    <p className="font-mono text-xs text-slate-500">{r.sub}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full w-2/3 rounded-full bg-primary" />
            </div>
          </div>
          <div className="card absolute -bottom-6 -left-2 flex items-center gap-2 px-4 py-3 lg:-left-8">
            <Icon name="leaf" className="text-primary" />
            <span className="font-mono text-sm font-bold text-dark">45 kg CO₂ saved</span>
          </div>
        </div>
      </div>
    </section>
  );
}
