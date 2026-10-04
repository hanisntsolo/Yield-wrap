import Icon from '../common/Icon';

const POINTS = [
  { icon: 'sparkles', text: 'AI matches surplus to the NGO that needs it most' },
  { icon: 'navigation', text: 'Live GPS tracking from pickup to plate' },
  { icon: 'shield', text: 'Food-safety hand-over records on every delivery' },
];

/** Two-column frame for login / register: brand panel (desktop) + form card. */
export default function AuthLayout({ title, subtitle, children, wide = false }) {
  return (
    <div className="container-page py-8 sm:py-12">
      <div className={`mx-auto grid gap-8 ${wide ? 'max-w-6xl lg:grid-cols-[minmax(0,1fr)_340px]' : 'max-w-5xl lg:grid-cols-[minmax(0,1fr)_380px]'}`}>
        <div className="card card-pad order-1 animate-fade-up sm:p-8">
          <h1 className="text-2xl font-extrabold sm:text-3xl">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
          <div className="mt-6">{children}</div>
        </div>
        <aside className="order-2 hidden rounded-2xl bg-gradient-to-br from-primary to-primary-dark p-8 text-white lg:block">
          <p className="text-sm font-semibold uppercase tracking-wider text-white/70">YIELD WRAP</p>
          <p className="mt-2 text-2xl font-extrabold leading-tight">
            Surplus Today.
            <br />
            Sustenance Tomorrow.
          </p>
          <ul className="mt-8 space-y-4">
            {POINTS.map((p) => (
              <li key={p.text} className="flex items-start gap-3 text-sm text-white/90">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/15">
                  <Icon name={p.icon} size={16} />
                </span>
                {p.text}
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}
