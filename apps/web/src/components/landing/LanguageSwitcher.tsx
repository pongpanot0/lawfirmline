'use client';

import { cn } from '@/lib/utils';
import { Locale } from '@/lib/i18n/landing';
import { useLocale } from './LocaleProvider';

export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, setLocale } = useLocale();

  const options: { value: Locale; label: string }[] = [
    { value: 'th', label: 'TH' },
    { value: 'en', label: 'EN' },
  ];

  return (
    <div
      className={cn(
        'inline-flex rounded-lg border border-border bg-muted/50 p-0.5',
        className,
      )}
      role="group"
      aria-label="Language"
    >
      {options.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          onClick={() => setLocale(value)}
          className={cn(
            'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
            locale === value
              ? 'bg-card text-foreground shadow-soft'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
