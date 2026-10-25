import Link from 'next/link';
import { CaseStatus } from '@lawfirm/shared';
import { StatusBadge } from './StatusBadge';

interface CaseCardProps {
  id: string;
  ownRef: string;
  title: string;
  status: CaseStatus;
  clientName?: string | null;
  leadLawyer?: { firstName: string; lastName: string };
}

export function CaseCard({
  id,
  ownRef,
  title,
  status,
  clientName,
  leadLawyer,
}: CaseCardProps) {
  return (
    <Link
      href={`/cases/${id}`}
      className="block rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40 hover:bg-muted/30"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{ownRef}</p>
          <h3 className="mt-1 font-semibold text-foreground">{title}</h3>
          {clientName && (
            <p className="mt-1 text-sm text-muted-foreground">ลูกความ: {clientName}</p>
          )}
          {leadLawyer && (
            <p className="mt-1 text-sm text-muted-foreground">
              ผู้รับผิดชอบ: {leadLawyer.firstName} {leadLawyer.lastName}
            </p>
          )}
        </div>
        <StatusBadge status={status} />
      </div>
    </Link>
  );
}
