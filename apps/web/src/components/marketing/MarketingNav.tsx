type Section = 'features' | 'pricing' | 'articles';

const LINKS: { key: Section; href: string; label: string }[] = [
  { key: 'features', href: '/#features', label: 'ฟีเจอร์' },
  { key: 'pricing', href: '/pricing', label: 'ราคา' },
  { key: 'articles', href: '/articles', label: 'บทความ' },
];

export function MarketingNav({ active }: { active?: Section }) {
  return (
    <header className="sticky top-0 z-50 border-b border-mk-rule bg-mk-paper/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1240px] items-center justify-between px-4 md:px-6">
        <a href="/" className="flex min-h-11 items-center gap-2.5 whitespace-nowrap">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-mk-ink font-display font-semibold text-mk-paper">
            ส
          </span>
          <span className="font-display text-lg font-semibold tracking-tight">SAMNUAN</span>
        </a>
        <nav className="hidden items-center gap-8 md:flex">
          {LINKS.map((link) => (
            <a
              key={link.key}
              href={link.href}
              aria-current={active === link.key ? 'page' : undefined}
              className={`flex min-h-11 items-center whitespace-nowrap border-b-2 text-sm ${
                active === link.key ? 'border-mk-brass text-mk-ink' : 'border-transparent text-mk-ink-2 hover:text-mk-ink'
              }`}
            >
              {link.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-4">
          <a href="/login" className="hidden min-h-11 items-center whitespace-nowrap text-sm sm:flex">
            เข้าสู่ระบบ
          </a>
          <a
            href="/register"
            className="btn-primary flex min-h-11 items-center whitespace-nowrap rounded-lg bg-mk-ink px-4 text-sm font-medium text-mk-paper"
          >
            ทดลองใช้ฟรี
          </a>
        </div>
      </div>
    </header>
  );
}
