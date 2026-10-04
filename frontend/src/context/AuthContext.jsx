import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authApi, setAuthFailureHandler } from '../services/api';
import { resetPushState } from '../services/firebase';

const AuthContext = createContext(null);

const unwrapUser = (res) => res?.user ?? (res?.id && res?.role ? res : null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const clear = useCallback(() => {
    setUser(null);
    setProfile(null);
    resetPushState();
  }, []);

  const refreshMe = useCallback(async () => {
    try {
      const res = await authApi.me();
      const nextUser = unwrapUser(res);
      setUser(nextUser);
      setProfile(res?.profile ?? null);
      return { user: nextUser, profile: res?.profile ?? null };
    } catch {
      clear();
      return { user: null, profile: null };
    }
  }, [clear]);

  useEffect(() => {
    setAuthFailureHandler(clear);
    let active = true;
    (async () => {
      await refreshMe();
      if (active) setLoading(false);
    })();
    return () => {
      active = false;
      setAuthFailureHandler(null);
    };
  }, [clear, refreshMe]);

  const login = useCallback(
    async (email, password) => {
      const res = await authApi.login({ email, password });
      const loggedIn = unwrapUser(res);
      setUser(loggedIn);
      const me = await refreshMe();
      return me.user || loggedIn;
    },
    [refreshMe],
  );

  const register = useCallback(
    async (payload) => {
      const res = await authApi.register(payload);
      const created = unwrapUser(res);
      setUser(created);
      const me = await refreshMe();
      return me.user || created;
    },
    [refreshMe],
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      /* cookies may already be gone; clear local state regardless */
    }
    clear();
  }, [clear]);

  const updateMe = useCallback(async (body) => {
    const res = await authApi.updateMe(body);
    const next = unwrapUser(res);
    if (next) setUser(next);
    return next;
  }, []);

  const value = useMemo(
    () => ({ user, profile, loading, login, register, logout, refreshMe, updateMe, setProfile }),
    [user, profile, loading, login, register, logout, refreshMe, updateMe],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
