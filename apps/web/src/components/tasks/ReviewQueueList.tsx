'use client';

import Link from 'next/link';
import type { ReviewQueueItem } from '@lawfirm/shared';
import { formatDateTime } from '@/lib/utils';

export function ReviewQueueList({ items, title = 'รอฉันตรวจ', empty = 'ไม่มีงานรอตรวจ' }: { items: ReviewQueueItem[]; title?: string; empty?: string }) {
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
                  {[item.caseRef, item.workerName && `จาก ${item.workerName}`, item.submittedAt && `ส่งเมื่อ ${formatDateTime(item.submittedAt)}`].filter(Boolean).join(' · ')}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
