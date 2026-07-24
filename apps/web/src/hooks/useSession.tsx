import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { primeCsrfToken } from '../api/client';
import * as authApi from '../api/auth';
import type { PublicUser } from '../types/api';

interface SessionContextValue {
  user: PublicUser | null;
  guestId: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [guestId, setGuestId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      await primeCsrfToken();
      const me = await authApi.getMe();
      setUser(me.user);
      setGuestId(me.guestId ?? null);
      setLoading(false);
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await authApi.login({ email, password });
    setUser(res.user);
    setGuestId(null);
  }, []);

  const register = useCallback(async (email: string, password: string, displayName: string) => {
    const res = await authApi.register({ email, password, displayName });
    setUser(res.user);
    setGuestId(null);
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout();
    const me = await authApi.getMe();
    setUser(null);
    setGuestId(me.guestId ?? null);
  }, []);

  return (
    <SessionContext.Provider value={{ user, guestId, loading, login, register, logout }}>
      {children}
    </SessionContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- hook and its provider are tightly coupled and belong together
export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return ctx;
}
