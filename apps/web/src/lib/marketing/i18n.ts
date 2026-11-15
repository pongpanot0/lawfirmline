import type { Metadata } from 'next';

export type Lang = 'th' | 'en';

export function localePath(lang: Lang, path: string): string {
  const thaiPath = path.replace(/^\/en(?=\/|[?#]|$)/, '') || '/';
  const normalized = /^[?#]/.test(thaiPath) ? `/${thaiPath}` : thaiPath;
  return lang === 'th'
    ? normalized
    : normalized === '/'
      ? '/en'
      : normalized.startsWith('/#') || normalized.startsWith('/?')
        ? `/en${normalized.slice(1)}`
        : `/en${normalized}`;
}

export function alternates(path: string): Metadata['alternates'] {
  const th = localePath('th', path);
  const en = localePath('en', path);
  return { canonical: path, languages: { th, en, 'x-default': th } };
}
