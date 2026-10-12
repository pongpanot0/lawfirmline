'use client';

import Link from 'next/link';
import type { ReviewQueueItem } from '@lawfirm/shared';
import { formatDateTime } from '@/lib/utils';
import { useDashboardT } from '@/components/landing/LocaleProvider';
import { fmt } from '@/lib/i18n/dashboard';

export function ReviewQueueList({ items, title, empty }: { items: ReviewQueueItem[]; title: string; empty: string }) {
  const d = useDashboardT();
  return (
    <section className="rounded-2xl border border-border bg-card" aria-label={title}>
      <h2 className="border-b border-border px-5 py-4 text-sm font-semibold">{title} <span className="ml-1 tabular-nums text-muted-foreground">{items.length}</span></h2>
      {items.length === 0 ? <p className="px-5 py-6 text-sm text-muted-foreground">{empty}</p> : (
        <ul className="divide-y divide-border/70">
          {items.map((item) => (
            <li key={item.id}>
              <Link href={item.caseId ? `/cases/${item.caseId}/tasks?task=${item.id}` : `/todos?task=${item.id}`} className="block px-5 py-4 hover:bg-muted/40">
                <p className="break-words text-sm font-semibold">{item.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {[item.caseRef, item.workerName && fmt(d.todos.reviewQueueFrom, { name: item.workerName }), item.submittedAt && fmt(d.todos.reviewQueueSent, { date: formatDateTime(item.submittedAt) })].filter(Boolean).join(' · ')}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
