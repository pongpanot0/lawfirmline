'use client';

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { portalApi, PortalContact } from './portal-api';

const TOKEN_KEY = 'lawfirm_portal_access_token';

interface PortalAuthContextValue {
  contact: PortalContact | null;
  token: string | null;
  loading: boolean;
  setSession: (accessToken: string) => Promise<PortalContact>;
  refreshContact: () => Promise<PortalContact | null>;
  logout: () => void;
}

const PortalAuthContext = createContext<PortalAuthContextValue | null>(null);

export function PortalAuthProvider({ children }: { children: ReactNode }) {
  const [contact, setContact] = useState<PortalContact | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (stored) {
      portalApi
        .getMe(stored)
        .then((c) => {
          setContact(c);
          setToken(stored);
        })
        .catch(() => localStorage.removeItem(TOKEN_KEY))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const setSession = useCallback(async (accessToken: string) => {
    localStorage.setItem(TOKEN_KEY, accessToken);
    const c = await portalApi.getMe(accessToken);
    setToken(accessToken);
    setContact(c);
    return c;
  }, []);

  const refreshContact = useCallback(async () => {
    if (!token) return null;
    const c = await portalApi.getMe(token);
    setContact(c);
    return c;
  }, [token]);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setContact(null);
  }, []);

  return (
    <PortalAuthContext.Provider value={{ contact, token, loading, setSession, refreshContact, logout }}>
      {children}
    </PortalAuthContext.Provider>
  );
}

export function usePortalAuth() {
  const ctx = useContext(PortalAuthContext);
  if (!ctx) throw new Error('usePortalAuth must be used within PortalAuthProvider');
  return ctx;
}

/** After magic-link / invite login, send users who still need a password to set one. */
export function portalHomeFor(contact: Pick<PortalContact, 'hasPassword'>): string {
  return contact.hasPassword ? '/portal' : '/portal/set-password';
}
