import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { asList, errorMessage, notificationsApi } from '../services/api';
import { enablePushNotifications, onForegroundMessage } from '../services/firebase';
import usePolling from '../hooks/usePolling';
import { POLL } from '../utils/constants';
import { useAuth } from './AuthContext';

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const lastCount = useRef(0);
  const notificationsRef = useRef(notifications);
  notificationsRef.current = notifications;

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const list = asList(await notificationsApi.list(), 'notifications');
      setNotifications(list);
      const unread = list.filter((n) => !n?.read).length;
      setUnreadCount(unread);
      lastCount.current = unread;
    } catch {
      /* inbox is best-effort */
    } finally {
      setLoading(false);
    }
  }, [user]);

  const pollCount = useCallback(async () => {
    if (!user) return;
    try {
      const res = await notificationsApi.unreadCount();
      const count = Number(res?.count ?? res ?? 0) || 0;
      setUnreadCount(count);
      // New unread messages arrived since the last poll: refresh the inbox.
      if (count !== lastCount.current) {
        lastCount.current = count;
        refresh();
      }
    } catch {
      /* ignore */
    }
  }, [user, refresh]);

  // Reset + initial load whenever the logged-in user changes.
  useEffect(() => {
    setNotifications([]);
    setUnreadCount(0);
    lastCount.current = 0;
    if (user) refresh();
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  usePolling(pollCount, POLL.unreadCount, { enabled: Boolean(user) });

  // Firebase push: request permission + register token on login; foreground messages -> toast.
  useEffect(() => {
    if (!user?.id) return undefined;
    let unsubscribe = () => {};
    let cancelled = false;
    (async () => {
      await enablePushNotifications(user.id);
      const unsub = await onForegroundMessage((payload) => {
        const title = payload?.notification?.title || payload?.data?.title || 'New notification';
        const body = payload?.notification?.body || payload?.data?.body || '';
        toast(body ? `${title}: ${body}` : title, { duration: 6000 });
        refresh();
      });
      if (cancelled) unsub();
      else unsubscribe = unsub;
    })();
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const markRead = useCallback(async (id) => {
    const target = notificationsRef.current.find((n) => n.id === id);
    if (target && !target.read) {
      setNotifications((list) => list.map((n) => (n.id === id ? { ...n, read: true } : n)));
      setUnreadCount((c) => Math.max(0, c - 1));
      lastCount.current = Math.max(0, lastCount.current - 1);
    }
    try {
      await notificationsApi.markRead(id);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not mark as read'));
      refresh();
    }
  }, [refresh]);

  const markAllRead = useCallback(async () => {
    setNotifications((list) => list.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
    lastCount.current = 0;
    try {
      await notificationsApi.markAllRead();
      toast.success('All notifications marked as read');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not mark all as read'));
      refresh();
    }
  }, [refresh]);

  const value = useMemo(
    () => ({ notifications, unreadCount, loading, refresh, markRead, markAllRead }),
    [notifications, unreadCount, loading, refresh, markRead, markAllRead],
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used inside <NotificationProvider>');
  return ctx;
}
