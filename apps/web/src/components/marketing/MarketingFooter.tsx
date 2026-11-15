import type { Lang } from '@/lib/marketing/i18n';

const copy = {
  th: {
    s0: 'นโยบายความเป็นส่วนตัว',
    s1: 'ขอลบบัญชี',
  },
  en: {
    s0: 'Privacy policy',
    s1: 'Request account deletion',
  },
};
export function MarketingFooter({ lang = 'th' }: { lang?: Lang } = {}) {
  const c = copy[lang];
  return (
    <footer className="border-t border-mk-rule">
      <div className="mx-auto flex max-w-[1240px] flex-col items-center justify-between gap-4 px-4 py-10 text-sm text-mk-ink-2 md:flex-row md:px-6">
        <span className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded bg-mk-ink font-display text-xs text-mk-paper">
            ส
          </span>
          © Samnuan
        </span>
        <span className="flex flex-wrap justify-center gap-6">
          <a className="flex min-h-11 items-center whitespace-nowrap hover:text-mk-ink" href="/privacy">
            {c.s0}
          </a>
          <a className="flex min-h-11 items-center whitespace-nowrap hover:text-mk-ink" href="/delete-account">
            {c.s1}
          </a>
        </span>
      </div>
    </footer>
  );
}
