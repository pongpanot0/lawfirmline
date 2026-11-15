import { localePath, type Lang } from '@/lib/marketing/i18n';

type Section = 'features' | 'pricing' | 'articles';
const copy = {
  th: {
    features: 'ฟีเจอร์',
    pricing: 'ราคา',
    articles: 'บทความ',
    login: 'เข้าสู่ระบบ',
    trial: 'ทดลองใช้ฟรี',
    switch: 'อ่านเป็นภาษาอังกฤษ',
  },
  en: {
    features: 'Features',
    pricing: 'Pricing',
    articles: 'Articles',
    login: 'Log in',
    trial: 'Start free trial',
    switch: 'Read in Thai',
  },
};
const LINKS: { key: Section; href: string }[] = [
  { key: 'features', href: '/#features' },
  { key: 'pricing', href: '/pricing' },
  { key: 'articles', href: '/articles' },
];

export function MarketingNav({ active, lang = 'th', path }: { active?: Section; lang?: Lang; path?: string }) {
  const c = copy[lang];
  const currentPath = path ?? (active === 'articles' ? '/articles' : active === 'pricing' ? '/pricing' : '/');
  const other = lang === 'th' ? 'en' : 'th';
  const otherPath = other === 'en' && currentPath.startsWith('/articles') ? '/' : currentPath;
  return (
    <header className="sticky top-0 z-50 border-b border-mk-rule bg-mk-paper/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1240px] items-center justify-between px-4 md:px-6">
        <a
          href={localePath(lang, '/')}
          aria-label="Samnuan"
          className="flex min-h-11 shrink-0 items-center gap-2.5 whitespace-nowrap"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-mk-ink font-display font-semibold text-mk-paper">
            ส
          </span>
          <span className="hidden font-display text-lg font-semibold tracking-tight min-[400px]:inline">SAMNUAN</span>
        </a>
        <nav className="hidden items-center gap-8 md:flex">
          {LINKS.filter((link) => lang === 'th' || link.key !== 'articles').map((link) => (
            <a
              key={link.key}
              href={localePath(lang, link.href)}
              aria-current={active === link.key ? 'page' : undefined}
              className={`flex min-h-11 items-center whitespace-nowrap border-b-2 text-sm ${active === link.key ? 'border-mk-brass text-mk-ink' : 'border-transparent text-mk-ink-2 hover:text-mk-ink'}`}
            >
              {c[link.key]}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-3 sm:gap-4">
          <span className="flex items-center gap-1 text-sm">
            {lang === 'th' ? (
              <strong className="px-1">TH</strong>
            ) : (
              <a
                href={localePath(other, otherPath)}
                hrefLang="th"
                aria-label={c.switch}
                className="flex min-h-11 items-center px-1"
              >
                TH
              </a>
            )}
            <span aria-hidden="true">|</span>
            {lang === 'en' ? (
              <strong className="px-1">EN</strong>
            ) : (
              <a
                href={localePath(other, otherPath)}
                hrefLang="en"
                aria-label={c.switch}
                className="flex min-h-11 items-center px-1"
              >
                EN
              </a>
            )}
          </span>
          <a href="/login" className="hidden min-h-11 items-center whitespace-nowrap text-sm sm:flex">
            {c.login}
          </a>
          <a
            href="/register"
            className="btn-primary flex min-h-11 items-center whitespace-nowrap rounded-lg bg-mk-ink px-3 text-sm sm:px-4 font-medium text-mk-paper"
          >
            {c.trial}
          </a>
        </div>
      </div>
    </header>
  );
}
