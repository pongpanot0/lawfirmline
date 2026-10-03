import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import * as SecureStore from 'expo-secure-store';
import { api, ApiError, clearTokens, getTokens, setTokens, USER_PROFILE_KEY } from './client';
import type { AuthUserInfo, LoginResponse } from './types';

interface AuthContextValue {
  /** null while restoring the session from SecureStore. */
  ready: boolean;
  user: AuthUserInfo | null;
  /**
   * True when the session came from storage at cold start (someone may have
   * picked up the phone) — the case the biometric gate protects. A session
   * created by typing the password just now needs no second challenge.
   */
  restored: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function cacheUser(user: AuthUserInfo, refreshToken: string | null) {
  await SecureStore.setItemAsync(USER_PROFILE_KEY, JSON.stringify({ refreshToken, user }));
}

/** The cache opens local drafts behind the biometric gate; the API still authorizes every request. */
export async function restoreSession(onCached: (user: AuthUserInfo) => void): Promise<AuthUserInfo | null> {
  const { accessToken, refreshToken } = await getTokens();
  if (!accessToken) return null;
  let cached: AuthUserInfo | null = null;
  try {
    const text = await SecureStore.getItemAsync(USER_PROFILE_KEY);
    const record = text ? JSON.parse(text) : null;
    if (refreshToken && record?.refreshToken === refreshToken && typeof record.user?.id === 'string' && typeof record.user?.email === 'string') cached = record.user;
  } catch { /* A missing cache cannot authenticate a different account. */ }
  const requireSameSession = async () => {
    if ((await getTokens()).refreshToken !== refreshToken) throw new Error('Session changed while restoring');
  };
  await requireSameSession();
  if (cached) onCached(cached);
  try {
    const me = await api<AuthUserInfo>('/auth/me');
    await requireSameSession();
    await cacheUser(me, refreshToken);
    await requireSameSession();
    return me;
  } catch (error) {
    await requireSameSession();
    if (error instanceof ApiError && [401, 403].includes(error.status)) { await clearTokens(); return null; }
    if (cached) return cached;
    throw error;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<AuthUserInfo | null>(null);
  const [restored, setRestored] = useState(false);

  // Cache-first: a stored token means "logged in" immediately; /auth/me
  // then refreshes the profile (and a dead token logs the user out).
  useEffect(() => {
    (async () => {
      try {
        const me = await restoreSession(cached => { setUser(cached); setRestored(true); setReady(true); });
        setUser(me); setRestored(!!me);
      } catch {
        // Connectivity failures preserve the session and scoped drafts; invalid credentials are cleared above.
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
    setRestored(false);
    const me = res.user ?? (await api<AuthUserInfo>('/auth/me'));
    await cacheUser(me, res.refreshToken);
    setUser(me);
  }, []);

  const logout = useCallback(async () => {
    await clearTokens();
    setUser(null);
    setRestored(false);
  }, []);

  const value = useMemo(
    () => ({ ready, user, restored, login, logout }),
    [ready, user, restored, login, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
