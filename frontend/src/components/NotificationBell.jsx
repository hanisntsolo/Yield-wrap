import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useNotifications } from '../context/NotificationContext';
import { formatRelativeTime } from '../utils/formatters';
import Icon from './common/Icon';
import Spinner from './common/Spinner';

export function NotificationItem({ n, onRead, compact = false }) {
  return (
    <button
      type="button"
      onClick={() => !n.read && onRead(n.id)}
      className={`flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 ${n.read ? '' : 'bg-primary-light/40'}`}
      aria-label={n.read ? n.title : `Mark "${n.title}" as read`}
    >
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? 'bg-transparent' : 'bg-primary'}`} aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className={`block text-sm ${n.read ? 'font-medium text-slate-700' : 'font-semibold text-dark'}`}>{n.title || 'Notification'}</span>
        {n.body ? <span className={`mt-0.5 block text-xs text-slate-500 ${compact ? 'line-clamp-2' : ''}`}>{n.body}</span> : null}
        <span className="mt-1 block text-[11px] text-slate-400">{formatRelativeTime(n.created_at)}</span>
      </span>
    </button>
  );
}

export default function NotificationBell() {
  const { notifications, unreadCount, loading, refresh, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    refresh();
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const recent = notifications.slice(0, 8);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="btn-icon relative"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications'}
      >
        <Icon name="bell" size={21} />
        {unreadCount > 0 ? (
          <span className="absolute right-1 top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-critical px-1 font-mono text-[10px] font-bold text-white ring-2 ring-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="fixed inset-x-3 top-16 z-[900] animate-fade-up overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-96">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-dark">Notifications</h2>
              {loading ? <Spinner size={14} className="text-primary" /> : null}
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm text-primary"
              onClick={markAllRead}
              disabled={unreadCount === 0}
            >
              <Icon name="check-all" size={14} /> Mark all read
            </button>
          </div>
          <div className="max-h-[60vh] divide-y divide-slate-100 overflow-y-auto">
            {recent.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-slate-500">
                <Icon name="inbox" size={28} className="mx-auto mb-2 text-slate-300" />
                You&apos;re all caught up.
              </div>
            ) : (
              recent.map((n) => <NotificationItem key={n.id} n={n} onRead={markRead} compact />)
            )}
          </div>
          <Link
            to="/notifications"
            onClick={() => setOpen(false)}
            className="block border-t border-slate-100 px-4 py-2.5 text-center text-sm font-semibold text-primary hover:bg-primary-light/50"
          >
            View all notifications
          </Link>
        </div>
      ) : null}
    </div>
  );
}
