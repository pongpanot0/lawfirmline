'use client';

import type { CaseStatus } from '@lawfirm/shared';
import { useDashboardT } from '@/components/landing/LocaleProvider';

const statusColors: Record<string, string> = {
  OPEN: 'bg-sky-100 text-sky-800',
  DRAFTING: 'bg-indigo-100 text-indigo-800',
  COURT_DATE: 'bg-violet-100 text-violet-800',
  IN_PROGRESS: 'bg-amber-100 text-amber-800',
  PENDING: 'bg-orange-100 text-orange-800',
  CLOSED: 'bg-slate-100 text-slate-600',
};

export function StatusBadge({ status }: { status: CaseStatus | string }) {
  const d = useDashboardT();
  const key = String(status);
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[key] ?? 'bg-slate-100 text-slate-600'}`}
    >
      {d.caseStatus[key as keyof typeof d.caseStatus] ?? key.replace('_', ' ')}
    </span>
  );
}
