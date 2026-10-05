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
    <div className="samnuan-paper samnuan-workspace min-h-dvh bg-background text-foreground lg:grid lg:grid-cols-[0.9fr_1.1fr]">
      <aside className="hidden min-w-0 flex-col justify-between bg-sidebar p-10 text-sidebar-foreground lg:flex xl:p-16">
        <Link href="/" aria-label="Samnuan"><SamnuanLogo markClassName="h-10 w-10" /></Link>
        <div className="max-w-lg py-16">
          <p className="font-display text-3xl font-medium leading-relaxed xl:text-4xl">{d.auth.brandTagline}</p>
          <p className="mt-6 max-w-prose text-base leading-relaxed text-sidebar-muted">{d.auth.brandBlurb}</p>
        </div>
        <p className="text-sm text-sidebar-muted">© {new Date().getFullYear()} Samnuan</p>
      </aside>
      <main className="flex min-w-0 items-center justify-center px-4 py-8 sm:px-8 lg:min-h-dvh">
        <div className="w-full max-w-md py-4 sm:py-8">
          <div className="mb-8 flex items-center justify-between gap-3">
            <Link href="/" aria-label="Samnuan"><SamnuanLogo /></Link>
            <LanguageSwitcher />
          </div>
          <h1 className="font-display text-3xl font-semibold leading-relaxed">{title}</h1>
          <p className="mb-6 mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
          {children}
        </div>
      </main>
    </div>
  );
}
