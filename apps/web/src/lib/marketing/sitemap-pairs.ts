import { localePath } from './i18n.ts';

export function sitemapPair(siteUrl: string, path: string, lastModified: Date, priority: number) {
  const languages = {
    th: `${siteUrl}${localePath('th', path)}`,
    en: `${siteUrl}${localePath('en', path)}`,
  };
  return [languages.th, languages.en].map((url) => ({ url, lastModified, priority, alternates: { languages } }));
}
