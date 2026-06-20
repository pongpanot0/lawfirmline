'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Scale, Menu, X } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useLocale } from './LocaleProvider';
import { LanguageSwitcher } from './LanguageSwitcher';

export function LandingNavbar() {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);

  const links = [
    { href: '#features', label: t.nav.features },
    { href: '#pricing', label: t.nav.pricing },
    { href: '#trial', label: t.nav.trial },
  ];

  const close = () => setOpen(false);

  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:h-16 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2" onClick={close}>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground sm:h-9 sm:w-9">
            <Scale className="h-4 w-4" />
          </div>
          <span className="text-base font-bold tracking-tight sm:text-lg">LexFlow</span>
        </Link>

        <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex lg:gap-8">
          {links.map((link) => (
            <a key={link.href} href={link.href} className="transition-colors hover:text-foreground">
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <LanguageSwitcher />
          <Link
            href="/login"
            className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'hidden sm:inline-flex')}
          >
            {t.nav.login}
          </Link>
          <Link href="/login" className={cn(buttonVariants({ size: 'sm' }), 'hidden sm:inline-flex')}>
            {t.nav.tryFree}
          </Link>
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border md:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-label={t.nav.menu}
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-border bg-background px-4 py-4 md:hidden">
          <nav className="flex flex-col gap-1">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={close}
                className="rounded-lg px-3 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
              >
                {link.label}
              </a>
            ))}
            <Link
              href="/login"
              onClick={close}
              className="rounded-lg px-3 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
            >
              {t.nav.login}
            </Link>
            <Link
              href="/login"
              onClick={close}
              className={cn(buttonVariants({ size: 'sm' }), 'mt-2 w-full')}
            >
              {t.nav.tryFree}
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
