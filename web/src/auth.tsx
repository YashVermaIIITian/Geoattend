import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, refresh, setToken } from './api';

export interface User { id: string; name: string; email: string; role: 'student' | 'lecturer'; rollNo?: string }
interface AuthCtx { user: User | null; loading: boolean; login: (e: string, p: string) => Promise<User>; logout: () => Promise<void> }
const Ctx = createContext<AuthCtx>(null!);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { refresh().then(setUser).finally(() => setLoading(false)); }, []); // restore session on page load
  const login = async (email: string, password: string) => {
    const d = await api('/auth/login', 'POST', { email, password });
    setToken(d.accessToken); setUser(d.user);
    return d.user as User;
  };
  const logout = async () => { await api('/auth/logout', 'POST').catch(() => {}); setToken(null); setUser(null); };
  return <Ctx.Provider value={{ user, loading, login, logout }}>{children}</Ctx.Provider>;
}
