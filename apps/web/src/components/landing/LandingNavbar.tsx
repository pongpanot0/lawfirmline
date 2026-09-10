'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { useLocale } from './LocaleProvider';
import { LanguageSwitcher } from './LanguageSwitcher';
import { SamnuanLogo } from '@/components/brand/SamnuanLogo';

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
    <div className="sticky top-0 z-50 px-3 pt-3 sm:px-4 sm:pt-4" style={{ background: 'var(--color-paper)' }}>
      <header
        className="mx-auto flex h-14 max-w-4xl items-center justify-between gap-3 rounded-full border px-3 sm:h-16 sm:px-4"
        style={{
          borderColor: 'var(--color-rule)',
          background: 'color-mix(in oklab, var(--color-paper-3) 88%, transparent)',
          backdropFilter: 'blur(10px) saturate(140%)',
          boxShadow: '0 1px 2px oklch(23% 0.02 40 / 0.05)',
        }}
      >
        <Link href="/" className="flex shrink-0 items-center gap-2 pl-1.5" onClick={close}>
          <SamnuanLogo className="lf-display text-base sm:text-lg" markClassName="h-8 w-8 rounded-full" />
        </Link>

        <nav className="hidden items-center gap-6 text-sm md:flex" style={{ color: 'var(--color-ink-2)' }}>
          {links.map((link) => (
            <a key={link.href} href={link.href} className="lf-nav-link">
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {/* Wrapper (not .lf-btn itself) owns the hidden/sm:flex toggle — .lf-btn sets its
              own unconditional `display`, which loads after Tailwind's utilities and would
              otherwise beat `hidden` at every width. */}
          <div className="hidden items-center gap-2 md:flex">
            <LanguageSwitcher />
            <Link href="/login" className="lf-btn lf-btn--outline !h-9 !px-4 !text-xs">
              {t.nav.login}
            </Link>
            <Link href="/login" className="lf-btn lf-btn--primary !h-9 !px-4 !text-xs">
              {t.nav.tryFree}
            </Link>
          </div>
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border md:hidden"
            style={{ borderColor: 'var(--color-rule)' }}
            onClick={() => setOpen((v) => !v)}
            aria-label={t.nav.menu}
            aria-expanded={open}
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </header>

      {open && (
        <div
          className="mx-auto mt-2 max-w-4xl rounded-3xl border px-4 py-4 md:hidden"
          style={{ borderColor: 'var(--color-rule)', background: 'var(--color-paper-3)' }}
        >
          <nav className="flex flex-col gap-1">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={close}
                className="rounded-xl px-3 py-2.5 text-sm font-medium"
                style={{ color: 'var(--color-ink)' }}
              >
                {link.label}
              </a>
            ))}
            <div className="mt-1 flex items-center justify-between px-3">
              <LanguageSwitcher />
              <Link href="/login" onClick={close} className="text-sm font-medium" style={{ color: 'var(--color-ink-2)' }}>
                {t.nav.login}
              </Link>
            </div>
            <Link href="/login" onClick={close} className="lf-btn lf-btn--primary mt-2 w-full">
              {t.nav.tryFree}
            </Link>
          </nav>
        </div>
      )}

      <style jsx>{`
        .lf-nav-link {
          position: relative;
          transition: color var(--dur-short) var(--ease-out);
        }
        .lf-nav-link:hover {
          color: var(--color-ink);
        }
        .lf-nav-link:focus-visible {
          outline: 2px solid var(--color-focus);
          outline-offset: 2px;
          border-radius: 2px;
        }
      `}</style>
    </div>
  );
}
