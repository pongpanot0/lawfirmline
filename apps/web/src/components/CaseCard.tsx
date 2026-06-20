import Link from 'next/link';
import { CaseStatus } from '@lawfirm/shared';
import { StatusBadge } from './StatusBadge';

interface CaseCardProps {
  id: string;
  caseNumber: string;
  title: string;
  status: CaseStatus;
  clientName?: string | null;
  leadLawyer?: { firstName: string; lastName: string };
}

export function CaseCard({
  id,
  caseNumber,
  title,
  status,
  clientName,
  leadLawyer,
}: CaseCardProps) {
  return (
    <Link
      href={`/cases/${id}`}
      className="block rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-brand-200 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-slate-500">{caseNumber}</p>
          <h3 className="mt-1 font-semibold text-slate-900">{title}</h3>
          {clientName && (
            <p className="mt-1 text-sm text-slate-500">Client: {clientName}</p>
          )}
          {leadLawyer && (
            <p className="mt-1 text-sm text-slate-500">
              Lead: {leadLawyer.firstName} {leadLawyer.lastName}
            </p>
          )}
        </div>
        <StatusBadge status={status} />
      </div>
    </Link>
  );
}
