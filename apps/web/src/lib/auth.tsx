'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';
import { AuthUser, LoginResult } from '@lawfirm/shared';
import { api } from './api';
import { clearCourtOffline } from './court-offline';
import { clearCourtDayDrafts } from './court-day-draft';

export const TOKEN_KEY = 'lawfirm_access_token';
export const REFRESH_KEY = 'lawfirm_refresh_token';

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  logout: () => void;
  applySession: (accessToken: string, refreshToken: string, user?: AuthUser | null) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (stored) {
      api
        .getMe(stored)
        .then((u) => {
          setUser(u);
          setToken(stored);
        })
        .catch(() => {
          localStorage.removeItem(TOKEN_KEY);
          localStorage.removeItem(REFRESH_KEY);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }

    const onSessionExpired = () => {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(REFRESH_KEY);
      setToken(null);
      setUser(null);
    };
    const onTokenRefreshed = (event: Event) => {
      const accessToken = (event as CustomEvent<{ accessToken: string }>).detail.accessToken;
      if (accessToken) setToken(accessToken);
    };
    window.addEventListener('auth:session-expired', onSessionExpired);
    window.addEventListener('auth:token-refreshed', onTokenRefreshed);
    return () => {
      window.removeEventListener('auth:session-expired', onSessionExpired);
      window.removeEventListener('auth:token-refreshed', onTokenRefreshed);
    };
  }, []);

  const applySession = useCallback(
    (accessToken: string, refreshToken: string, nextUser?: AuthUser | null) => {
      localStorage.setItem(TOKEN_KEY, accessToken);
      localStorage.setItem(REFRESH_KEY, refreshToken);
      setToken(accessToken);
      if (nextUser !== undefined) {
        setUser(nextUser);
      }
    },
    [],
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const res: LoginResult = await api.login(email, password);
      if ('mfaRequired' in res) return res;
      applySession(res.accessToken, res.refreshToken, res.user);
      return res;
    },
    [applySession],
  );

  useEffect(() => {
    if (!user) return;
    try {
      const identity = JSON.parse(localStorage.getItem('samnuan:offline-identity') ?? 'null');
      if (identity && (identity.id !== user.id || identity.firmId !== user.firmId)) void clearCourtOffline();
    } catch { void clearCourtOffline(); }
  }, [user]);

  const logout = useCallback(() => {
    const refreshToken = localStorage.getItem(REFRESH_KEY);
    if (refreshToken) void api.logout(refreshToken).catch(() => {});
    clearCourtDayDrafts();
    void clearCourtOffline();
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, applySession }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function persistTokens(accessToken: string, refreshToken: string): void {
  localStorage.setItem(TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_KEY, refreshToken);
}
