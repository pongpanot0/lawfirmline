'use client';

import type { ExpenseStatus } from '@lawfirm/shared';

const statusConfig: Record<string, { label: string; className: string }> = {
  // A draft commits nothing: it is deliberately the quietest colour here.
  DRAFT: { label: 'ร่าง', className: 'bg-muted text-foreground' },
  PENDING: { label: 'รออนุมัติ', className: 'bg-warning/10 text-warning' },
  APPROVED: { label: 'อนุมัติแล้ว', className: 'bg-accent text-primary' },
  PAID: { label: 'จ่ายแล้ว', className: 'bg-success/10 text-success' },
  REJECTED: { label: 'ปฏิเสธ', className: 'bg-destructive/10 text-destructive' },
};

export function ExpenseStatusBadge({ status }: { status: ExpenseStatus | string }) {
  const config = statusConfig[status] ?? {
    label: status,
    className: 'bg-muted text-foreground',
  };
  return (
    <span className={`inline-flex rounded-sm px-2 py-1 text-xs font-medium ${config.className}`}>
      {config.label}
    </span>
  );
}
