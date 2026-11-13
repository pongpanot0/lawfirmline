import Link from 'next/link';
import { KanbanSquare, ListChecks, Table2 } from 'lucide-react';

export type CaseView = 'queue' | 'table' | 'board';

const VIEWS = [
  { view: 'queue', href: '/cases', label: 'งานต่อไป', hint: 'ดูทีละคดี พร้อมงานที่ต้องทำต่อ', Icon: ListChecks },
  { view: 'table', href: '/cases?view=table', label: 'ตารางคดี', hint: 'ดูทุกคดีในตาราง กรอง เรียง และส่งออกได้', Icon: Table2 },
  { view: 'board', href: '/cases/board', label: 'บอร์ด', hint: 'ดูคดีแยกตามขั้นตอน', Icon: KanbanSquare },
] as const;

export function CaseViewToggle({ current }: { current: CaseView }) {
  return (
    <nav aria-label="มุมมองคดี" className="mb-4 grid grid-cols-3 gap-1 rounded-xl border bg-muted p-1 shadow-sm">
      {VIEWS.map(({ view, href, label, hint, Icon }) => (
        <Link key={view} href={href} title={hint} aria-current={current === view ? 'page' : undefined}
          className={`flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-2 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${current === view ? 'bg-card text-primary shadow-md' : 'text-muted-foreground hover:bg-card/60 hover:text-foreground'}`}>
          <span className="flex items-center gap-2 text-sm font-semibold"><Icon aria-hidden="true" className="h-4 w-4" />{label}</span>
          <span className="hidden text-xs font-normal text-muted-foreground sm:block">{hint}</span>
        </Link>
      ))}
    </nav>
  );
}
