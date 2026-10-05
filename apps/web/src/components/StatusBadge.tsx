'use client';

import type { CaseStatus } from '@lawfirm/shared';
import { useDashboardT } from '@/components/landing/LocaleProvider';

const statusColors: Record<string, string> = {
  OPEN: 'bg-accent text-accent-foreground',
  DRAFTING: 'bg-accent text-accent-foreground',
  COURT_DATE: 'bg-warning/10 text-warning',
  IN_PROGRESS: 'bg-warning/10 text-warning',
  PENDING: 'bg-muted text-muted-foreground',
  CLOSED: 'bg-muted text-muted-foreground',
};

export function StatusBadge({ status }: { status: CaseStatus | string }) {
  const d = useDashboardT();
  const key = String(status);
  return (
    <span
      className={`inline-flex rounded-sm px-2 py-1 text-xs font-medium ${statusColors[key] ?? 'bg-muted text-muted-foreground'}`}
    >
      {d.caseStatus[key as keyof typeof d.caseStatus] ?? key.replace('_', ' ')}
    </span>
  );
}
