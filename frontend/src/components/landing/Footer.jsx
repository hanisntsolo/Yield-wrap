import { Link } from 'react-router-dom';
import { LogoMark } from '../common/Logo';

const COLUMNS = [
  {
    title: 'Get involved',
    links: [
      { to: '/register?role=donor', label: 'Donate food' },
      { to: '/register?role=ngo', label: 'Register an NGO' },
      { to: '/register?role=volunteer', label: 'Volunteer' },
    ],
  },
  {
    title: 'Platform',
    links: [
      { to: '/#how-it-works', label: 'How it works' },
      { to: '/#impact', label: 'Impact' },
      { to: '/login', label: 'Log in' },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="bg-dark text-slate-300">
      <div className="container-page grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-2">
          <div className="flex items-center gap-2.5">
            <LogoMark />
            <span className="text-lg font-extrabold tracking-tight text-white">
              YIELD<span className="text-accent"> WRAP</span>
            </span>
          </div>
          <p className="mt-3 max-w-sm text-sm text-slate-400">
            Surplus Today. Sustenance Tomorrow. AI-powered, real-time food redistribution connecting donors, NGOs and volunteers.
          </p>
        </div>
        {COLUMNS.map((col) => (
          <div key={col.title}>
            <h3 className="text-sm font-semibold text-white">{col.title}</h3>
            <ul className="mt-3 space-y-2 text-sm">
              {col.links.map((l) => (
                <li key={l.label}>
                  {l.to.startsWith('/#') ? (
                    <a href={l.to} className="hover:text-white">
                      {l.label}
                    </a>
                  ) : (
                    <Link to={l.to} className="hover:text-white">
                      {l.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-white/10">
        <div className="container-page flex flex-col gap-2 py-5 text-xs text-slate-500 sm:flex-row sm:justify-between">
          <p>© {new Date().getFullYear()} YIELD WRAP. Every meal matters.</p>
          <p>Map data © OpenStreetMap contributors</p>
        </div>
      </div>
    </footer>
  );
}
