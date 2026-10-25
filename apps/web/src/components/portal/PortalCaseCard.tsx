'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { StageTrack } from '@/components/portal/StageTrack';
import { getCaseStatusDisplay } from '@/lib/case-status';
import { useDashboardT } from '@/components/landing/LocaleProvider';
import type { PortalCaseSummary } from '@/lib/portal-api';
import { formatDate } from '@/lib/utils';

/** One case the client can open: title, status in text, progress, next hearing. */
export function PortalCaseCard({ item, showOpened = false }: { item: PortalCaseSummary; showOpened?: boolean }) {
  const d = useDashboardT();
  const status = getCaseStatusDisplay(item.status, d.caseStatus);
  return (
    <Link
      href={`/portal/cases/${item.id}`}
      className="block rounded-xl border bg-card p-4 transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-5"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold leading-snug">{item.title}</p>
          <p className="text-sm text-muted-foreground">
            เลขที่อ้างอิง {item.ownRef}
            {item.courtName ? ` · ${item.courtName}` : ''}
          </p>
        </div>
        <Badge variant={status.variant} className="shrink-0">{status.label}</Badge>
      </div>
      <StageTrack stage={item.stage} status={item.status} className="mb-3" />
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm text-muted-foreground">
        {item.nextHearing ? (
          <span className="font-medium text-foreground">นัดศาลถัดไป {formatDate(item.nextHearing.startAt)}</span>
        ) : (
          <span>ยังไม่มีนัดศาล</span>
        )}
        {showOpened && <span>เปิดคดีเมื่อ {formatDate(item.openedAt)}</span>}
      </div>
    </Link>
  );
}
