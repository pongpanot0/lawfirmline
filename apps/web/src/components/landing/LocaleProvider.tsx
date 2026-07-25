'use client';

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { landingCopy, Locale, LandingCopy } from '@/lib/i18n/landing';
import { dashboardCopy, DashboardCopy } from '@/lib/i18n/dashboard';

const STORAGE_KEY = 'lexflow_locale';

interface LocaleContextValue {
  locale: Locale;
  t: LandingCopy;
  d: DashboardCopy;
  setLocale: (locale: Locale) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('th');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'th' || stored === 'en') {
      setLocaleState(stored);
    }
    setReady(true);
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    localStorage.setItem(STORAGE_KEY, next);
    document.documentElement.lang = next;
  }, []);

  useEffect(() => {
    if (ready) document.documentElement.lang = locale;
  }, [locale, ready]);

  return (
    <LocaleContext.Provider
      value={{ locale, t: landingCopy[locale], d: dashboardCopy[locale], setLocale }}
    >
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocale must be used within LocaleProvider');
  return ctx;
}

export function useDashboardT() {
  return useLocale().d;
}
