import Link from 'next/link';

export function CaseViewToggle({ current }: { current: 'list' | 'board' }) {
  return (
    <nav aria-label="มุมมองคดี" className="inline-flex shrink-0 rounded-lg bg-muted p-1">
      {([['list', '/cases', 'รายการ'], ['board', '/cases/board', 'บอร์ด']] as const).map(([view, href, label]) => (
        <Link key={view} href={href} aria-current={current === view ? 'page' : undefined}
          className={`inline-flex min-h-11 items-center whitespace-nowrap rounded-md px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${current === view ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
