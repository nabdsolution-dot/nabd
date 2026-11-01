import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, getToken, setToken, type Me } from './api';

interface AuthState {
  me: Me | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
  can: (...perms: string[]) => boolean;
}
const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(!!getToken());

  const load = useCallback(async () => {
    try { setMe(await api<Me>('GET', '/me')); } catch { setMe(null); } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (getToken()) void load();
    const out = () => setMe(null);
    window.addEventListener('nabd:signed-out', out);
    return () => window.removeEventListener('nabd:signed-out', out);
  }, [load]);

  const value = useMemo<AuthState>(() => ({
    me, loading,
    signIn: async (email, password) => {
      const r = await api<{ token: string }>('POST', '/auth/login', { email, password });
      setToken(r.token);
      await load();
    },
    signOut: () => { setToken(null); setMe(null); },
    can: (...perms) => !!me && perms.some((p) => me.permissions.includes(p))
  }), [me, loading, load]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}
