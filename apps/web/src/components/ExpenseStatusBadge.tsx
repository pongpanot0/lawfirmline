'use client';

import type { ExpenseStatus } from '@lawfirm/shared';

const statusConfig: Record<string, { label: string; className: string }> = {
  PENDING: { label: 'รออนุมัติ', className: 'bg-amber-100 text-amber-800' },
  APPROVED: { label: 'อนุมัติแล้ว', className: 'bg-blue-100 text-blue-800' },
  PAID: { label: 'จ่ายแล้ว', className: 'bg-green-100 text-green-800' },
  REJECTED: { label: 'ปฏิเสธ', className: 'bg-red-100 text-red-800' },
};

export function ExpenseStatusBadge({ status }: { status: ExpenseStatus | string }) {
  const config = statusConfig[status] ?? {
    label: status,
    className: 'bg-slate-100 text-slate-700',
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${config.className}`}>
      {config.label}
    </span>
  );
}
