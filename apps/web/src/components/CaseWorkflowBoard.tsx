'use client';

import Link from 'next/link';
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

const WORKFLOW_COLUMNS: { status: string; label: string; color: string }[] = [
  { status: 'OPEN', label: 'Open / เปิดคดี', color: 'border-sky-200 bg-sky-50' },
  { status: 'DRAFTING', label: 'Drafting / ร่างเอกสาร', color: 'border-amber-200 bg-amber-50' },
  { status: 'COURT_DATE', label: 'Court Date / นัดศาล', color: 'border-violet-200 bg-violet-50' },
  { status: 'CLOSED', label: 'Closed / ปิดคดี', color: 'border-slate-200 bg-slate-50' },
];

interface CaseWorkflowBoardProps {
  cases: WorkflowCase[];
  onStatusChange?: (caseId: string, status: string) => void;
  canDrag?: boolean;
}

export function CaseWorkflowBoard({ cases, onStatusChange, canDrag }: CaseWorkflowBoardProps) {
  const getColumnCases = (status: string) => {
    if (status === 'OPEN') {
      return cases.filter((c) => c.status === 'OPEN' || c.status === 'IN_PROGRESS' || c.status === 'PENDING');
    }
    return cases.filter((c) => c.status === status);
  };

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {WORKFLOW_COLUMNS.map((col) => (
        <div key={col.status} className={`rounded-xl border-2 p-4 ${col.color}`}>
          <h3 className="mb-3 text-sm font-semibold text-slate-700">
            {col.label}
            <span className="ml-2 rounded-full bg-white px-2 py-0.5 text-xs text-slate-500">
              {getColumnCases(col.status).length}
            </span>
          </h3>
          <div className="space-y-2">
            {getColumnCases(col.status).map((c) => (
              <div
                key={c.id}
                className="rounded-lg border border-white bg-white p-3 shadow-sm"
              >
                <Link href={`/cases/${c.id}`} className="block hover:text-brand-600">
                  <p className="text-xs text-slate-400">{c.ownRef}</p>
                  <p className="text-sm font-medium">{c.title}</p>
                  {c.courtName && (
                    <p className="mt-1 text-xs text-slate-500">🏛 {c.courtName}</p>
                  )}
                  {c.clientName && (
                    <p className="text-xs text-slate-400">ลูกความ: {c.clientName}</p>
                  )}
                </Link>
                {canDrag && onStatusChange && (
                  <select
                    value={c.status}
                    onChange={(e) => onStatusChange(c.id, e.target.value)}
                    className="mt-2 w-full rounded border border-slate-200 px-2 py-1 text-xs"
                  >
                    {WORKFLOW_COLUMNS.map((w) => (
                      <option key={w.status} value={w.status}>{w.label}</option>
                    ))}
                    <option value="IN_PROGRESS">ยื่นฟ้องแล้ว</option>
                  </select>
                )}
                <div className="mt-2">
                  <StatusBadge status={c.status as CaseStatus} />
                </div>
              </div>
            ))}
            {getColumnCases(col.status).length === 0 && (
              <p className="py-4 text-center text-xs text-slate-400">ไม่มีคดี</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
