import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { dashboardPathFor, ROLE_LABELS } from '../utils/constants';
import { initials } from '../utils/formatters';
import Logo from './common/Logo';
import Icon from './common/Icon';
import VerifiedBadge from './common/VerifiedBadge';
import NotificationBell from './NotificationBell';

const linkClass = ({ isActive }) =>
  `rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
    isActive ? 'bg-primary-light text-primary' : 'text-slate-600 hover:bg-slate-100 hover:text-dark'
  }`;

function getLinks(user) {
  if (!user) {
    return [
      { to: '/#how-it-works', label: 'How it works', anchor: true },
      { to: '/#impact', label: 'Impact', anchor: true },
    ];
  }
  const links = [{ to: dashboardPathFor(user.role), label: 'Dashboard', icon: 'grid' }];
  if (user.role === 'donor') links.push({ to: '/advertising', label: 'Advertising', icon: 'megaphone' });
  links.push({ to: '/notifications', label: 'Notifications', icon: 'bell' }, { to: '/profile', label: 'Profile', icon: 'user' });
  return links;
}

function UserMenu({ user, onLogout }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-xl py-1 pl-1 pr-2 transition-colors hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-primary/50"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-sm font-bold text-white">{initials(user.name)}</span>
        <span className="hidden max-w-[10rem] text-left lg:block">
          <span className="block truncate text-sm font-semibold text-dark">{user.name}</span>
          <span className="block text-xs text-slate-500">{ROLE_LABELS[user.role] || user.role}</span>
        </span>
        <Icon name="chevron-down" size={16} className="hidden text-slate-400 lg:block" />
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 top-12 z-[900] w-64 animate-fade-up overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="truncate text-sm font-semibold text-dark">{user.name}</p>
            <p className="truncate text-xs text-slate-500">{user.email}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="badge bg-slate-100 text-slate-600 ring-slate-200">{ROLE_LABELS[user.role] || user.role}</span>
              {user.is_premium_partner ? <VerifiedBadge /> : null}
              {user.is_verified ? (
                <span className="badge bg-primary-light text-primary ring-primary/20">
                  <Icon name="check" size={11} strokeWidth={3} /> Verified
                </span>
              ) : null}
            </div>
          </div>
          <div className="py-1">
            <Link role="menuitem" to={dashboardPathFor(user.role)} onClick={() => setOpen(false)} className="flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
              <Icon name="grid" size={16} /> Dashboard
            </Link>
            <Link role="menuitem" to="/profile" onClick={() => setOpen(false)} className="flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
              <Icon name="user" size={16} /> Profile
            </Link>
            <button
              role="menuitem"
              type="button"
              onClick={() => {
                setOpen(false);
                onLogout();
              }}
              className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm text-critical hover:bg-critical-light"
            >
              <Icon name="logout" size={16} /> Log out
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function Navbar() {
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const links = getLinks(user);

  useEffect(() => setMobileOpen(false), [location.pathname, location.hash]);

  const handleLogout = async () => {
    await logout();
    toast.success('You have been logged out');
    navigate('/', { replace: true });
  };

  return (
    <header className="sticky top-0 z-[800] border-b border-slate-200/70 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/75">
      <nav className="container-page flex h-16 items-center justify-between gap-3" aria-label="Main">
        <div className="flex items-center gap-6">
          <Logo to={user ? dashboardPathFor(user.role) : '/'} />
          <div className="hidden items-center gap-1 md:flex">
            {links.map((l) =>
              l.anchor ? (
                <a key={l.to} href={l.to} className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 hover:text-dark">
                  {l.label}
                </a>
              ) : (
                <NavLink key={l.to} to={l.to} className={linkClass}>
                  {l.label}
                </NavLink>
              ),
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          {user ? (
            <>
              <NotificationBell />
              <div className="hidden md:block">
                <UserMenu user={user} onLogout={handleLogout} />
              </div>
            </>
          ) : (
            <div className="hidden items-center gap-2 md:flex">
              <Link to="/login" className="btn btn-ghost">
                Log in
              </Link>
              <Link to="/register" className="btn btn-primary">
                Get started
              </Link>
            </div>
          )}
          <button
            type="button"
            className="btn-icon md:hidden"
            onClick={() => setMobileOpen((o) => !o)}
            aria-expanded={mobileOpen}
            aria-controls="mobile-menu"
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          >
            <Icon name={mobileOpen ? 'x' : 'menu'} size={22} />
          </button>
        </div>
      </nav>

      {mobileOpen ? (
        <div id="mobile-menu" className="animate-fade-up border-t border-slate-200 bg-white md:hidden">
          <div className="container-page space-y-1 py-3">
            {user ? (
              <div className="mb-2 flex items-center gap-3 rounded-2xl bg-surface p-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-sm font-bold text-white">{initials(user.name)}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-dark">{user.name}</p>
                  <p className="truncate text-xs text-slate-500">
                    {ROLE_LABELS[user.role] || user.role} · {user.email}
                  </p>
                </div>
                {user.is_premium_partner ? <VerifiedBadge size="xs" /> : null}
              </div>
            ) : null}
            {links.map((l) =>
              l.anchor ? (
                <a key={l.to} href={l.to} className="block rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100">
                  {l.label}
                </a>
              ) : (
                <NavLink
                  key={l.to}
                  to={l.to}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold ${
                      isActive ? 'bg-primary-light text-primary' : 'text-slate-700 hover:bg-slate-100'
                    }`
                  }
                >
                  {l.icon ? <Icon name={l.icon} size={18} /> : null}
                  {l.label}
                </NavLink>
              ),
            )}
            <div className="pt-2">
              {user ? (
                <button type="button" onClick={handleLogout} className="btn btn-secondary w-full text-critical">
                  <Icon name="logout" size={16} /> Log out
                </button>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Link to="/login" className="btn btn-secondary">
                    Log in
                  </Link>
                  <Link to="/register" className="btn btn-primary">
                    Get started
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
