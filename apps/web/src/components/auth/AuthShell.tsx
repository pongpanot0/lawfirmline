'use client';

import Link from 'next/link';
import { SamnuanLogo } from '@/components/brand/SamnuanLogo';
import { LanguageSwitcher } from '@/components/landing/LanguageSwitcher';
import { useDashboardT } from '@/components/landing/LocaleProvider';

export function AuthShell({ title, description, children }: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  const d = useDashboardT();
  return (
    <div className="min-h-dvh bg-background lg:grid lg:grid-cols-2">
      <aside className="hidden min-w-0 flex-col justify-between bg-primary p-10 text-primary-foreground lg:flex xl:p-16">
        <Link href="/" aria-label="Samnuan"><SamnuanLogo markClassName="h-10 w-10" /></Link>
        <div className="max-w-lg py-16">
          <p className="text-3xl font-semibold leading-snug xl:text-4xl">{d.auth.brandTagline}</p>
          <p className="mt-5 text-lg leading-relaxed text-primary-foreground/85">{d.auth.brandBlurb}</p>
        </div>
        <p className="text-sm text-primary-foreground/80">© {new Date().getFullYear()} Samnuan</p>
      </aside>
      <main className="flex min-w-0 items-center justify-center px-4 py-8 sm:px-8 lg:min-h-dvh">
        <div className="w-full max-w-md rounded-2xl border bg-card p-5 shadow-card sm:p-8">
          <div className="mb-8 flex items-center justify-between gap-3">
            <Link href="/" aria-label="Samnuan"><SamnuanLogo /></Link>
            <LanguageSwitcher />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mb-6 mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
          {children}
        </div>
      </main>
    </div>
  );
}
