'use client';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { StageTrack } from '@/components/portal/StageTrack';
import type { PortalCaseSummary } from '@/lib/portal-api';
import { formatDate } from '@/lib/utils';

export function PortalCaseCard({ item, showOpened = false }: { item: PortalCaseSummary; showOpened?: boolean }) {
  return <Link href={`/portal/cases/${item.id}`} className="flex min-h-28 items-center gap-3 rounded-xl border bg-card p-4 shadow-sm hover:border-primary/40 sm:p-5">
    <div className="min-w-0 flex-1"><p className="font-semibold">{item.title}</p><p className="mt-1 text-sm text-muted-foreground">{item.ownRef}{item.courtName ? ` · ${item.courtName}` : ''}</p><StageTrack stage={item.stage} status={item.status} className="mt-4" />{showOpened && <p className="mt-2 text-sm text-muted-foreground">เปิดคดีเมื่อ {formatDate(item.openedAt)}</p>}</div><ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
  </Link>;
}
