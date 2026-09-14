import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { api, clearTokens, getTokens, setTokens } from './client';
import type { AuthUserInfo, LoginResponse } from './types';

interface AuthContextValue {
  /** null while restoring the session from SecureStore. */
  ready: boolean;
  user: AuthUserInfo | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<AuthUserInfo | null>(null);

  // Cache-first: a stored token means "logged in" immediately; /auth/me
  // then refreshes the profile (and a dead token logs the user out).
  useEffect(() => {
    (async () => {
      try {
        const { accessToken } = await getTokens();
        if (accessToken) {
          const me = await api<AuthUserInfo>('/auth/me');
          setUser(me);
        }
      } catch {
        await clearTokens();
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api<LoginResponse>('/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    await setTokens(res.accessToken, res.refreshToken);
    setUser(res.user ?? (await api<AuthUserInfo>('/auth/me')));
  }, []);

  const logout = useCallback(async () => {
    await clearTokens();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ ready, user, login, logout }),
    [ready, user, login, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
