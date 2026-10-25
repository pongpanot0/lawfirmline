'use client';

import { getCaseStatusDisplay } from '@/lib/case-status';
import { useDashboardT } from '@/components/landing/LocaleProvider';

import Link from 'next/link';
import { Landmark } from 'lucide-react';
import type { CaseStatus } from '@lawfirm/shared';
import { StatusBadge } from './StatusBadge';

export interface WorkflowCase {
  id: string;
  ownRef: string;
  title: string;
  status: CaseStatus | string;
  clientName?: string | null;
  courtName?: string | null;
  caseType?: { name: string } | null;
  leadLawyer: { firstName: string; lastName: string };
}

const WORKFLOW_COLUMNS: { status: string }[] = [
  // Labels come from the one status map the rest of the app reads, so a column
  // and a badge can never disagree about what a status is called.
  { status: 'OPEN' },
  { status: 'DRAFTING' },
  { status: 'IN_PROGRESS' },
  { status: 'PENDING' },
  { status: 'COURT_DATE' },
  { status: 'CLOSED' },
  { status: 'ARCHIVED' },
];

interface CaseWorkflowBoardProps {
  cases: WorkflowCase[];
  onStatusChange?: (caseId: string, status: string) => void;
  canDrag?: boolean;
}

export function CaseWorkflowBoard({ cases, onStatusChange, canDrag }: CaseWorkflowBoardProps) {
  const getColumnCases = (status: string) => {
    return cases.filter((c) => c.status === status);
  };

  const d = useDashboardT();

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {WORKFLOW_COLUMNS.map((col) => (
        <div key={col.status} className="rounded-xl border bg-muted/30 p-4">
          <h3 className="mb-3 text-sm font-semibold text-foreground">
            {getCaseStatusDisplay(col.status, d.caseStatus).label}
            <span className="ml-2 rounded-full bg-card px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
              {getColumnCases(col.status).length}
            </span>
          </h3>
          <div className="space-y-2">
            {getColumnCases(col.status).map((c) => (
              <div
                key={c.id}
                className="rounded-lg border bg-card p-3"
              >
                <Link href={`/cases/${c.id}`} className="block rounded-sm hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <p className="text-xs text-muted-foreground">{c.ownRef}</p>
                  <p className="text-sm font-medium">{c.title}</p>
                  {c.courtName && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><Landmark aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />{c.courtName}</p>
                  )}
                  {c.clientName && (
                    <p className="text-xs text-muted-foreground">ลูกความ: {c.clientName}</p>
                  )}
                </Link>
                {canDrag && onStatusChange && (
                  <select
                    aria-label={`สถานะคดี ${c.ownRef}`}
                    value={c.status}
                    disabled={c.status === 'CLOSED' || c.status === 'ARCHIVED'}
                    onChange={(e) => onStatusChange(c.id, e.target.value)}
                    className="mt-2 min-h-11 w-full rounded-md border border-input bg-card px-2 text-xs sm:min-h-9"
                  >
                    {/* closing goes through the close button, reopening through reopen; PATCH refuses both */}
                    {WORKFLOW_COLUMNS.map((w) => (
                      <option key={w.status} value={w.status} disabled={w.status === 'CLOSED' || w.status === 'ARCHIVED'}>{getCaseStatusDisplay(w.status, d.caseStatus).label}</option>
                    ))}
                  </select>
                )}
                <div className="mt-2">
                  <StatusBadge status={c.status as CaseStatus} />
                </div>
              </div>
            ))}
            {getColumnCases(col.status).length === 0 && (
              <p className="py-4 text-center text-xs text-muted-foreground">ไม่มีคดี</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
