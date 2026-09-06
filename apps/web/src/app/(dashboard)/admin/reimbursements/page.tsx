'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { ExpenseStatus } from '@lawfirm/shared';
import { FirmRole } from '@lawfirm/shared';
import { useAuth, getStoredToken } from '@/lib/auth';
import { api, ApiError, ExpenseItem } from '@/lib/api';
import { PageHeader } from '@/components/lexflow/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ExpenseStatusBadge } from '@/components/ExpenseStatusBadge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/misc';
import { cn, formatDate } from '@/lib/utils';

const FILTERS = ['', 'PENDING', 'APPROVED', 'PAID', 'REJECTED'] as const;

const FILTER_LABELS: Record<string, string> = {
  PENDING: 'รออนุมัติ',
  APPROVED: 'อนุมัติแล้ว',
  PAID: 'จ่ายแล้ว',
  REJECTED: 'ปฏิเสธ',
};

export default function ReimbursementsPage() {
  const { token, user } = useAuth();
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    const authToken = token ?? getStoredToken();
    if (!authToken) {
      setLoading(false);
      return;
    }
    setError('');
    api
      .getExpenses(authToken, filter || undefined)
      .then(setExpenses)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) return;
        setError(err instanceof Error ? err.message : 'Failed to load reimbursements / โหลดรายการเบิกจ่ายไม่สำเร็จ');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    setLoading(true);
    load();
  }, [token, filter]);

  const updateStatus = async (id: string, status: ExpenseStatus) => {
    const authToken = token ?? getStoredToken();
    if (!authToken) return;
    await api.updateExpenseStatus(authToken, id, status);
    setLoading(true);
    load();
  };

  if (user?.firmRole !== FirmRole.OWNER) {
    return <p className="text-destructive">Access denied. Admin only. / ไม่มีสิทธิ์เข้าถึง เฉพาะ Admin</p>;
  }

  const pendingTotal = expenses
    .filter((e) => e.status === 'PENDING' || e.status === 'APPROVED')
    .reduce((sum, e) => sum + e.amount, 0);

  const ActionButtons = ({ e }: { e: ExpenseItem }) => (
    <div className="flex flex-wrap gap-1.5">
      {e.status === 'PENDING' && (
        <>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => updateStatus(e.id, 'APPROVED' as ExpenseStatus)}>
            Approve / อนุมัติ
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs text-destructive" onClick={() => updateStatus(e.id, 'REJECTED' as ExpenseStatus)}>
            Reject / ปฏิเสธ
          </Button>
        </>
      )}
      {e.status === 'APPROVED' && (
        <Button size="sm" className="h-7 text-xs" onClick={() => updateStatus(e.id, 'PAID' as ExpenseStatus)}>
          Mark Paid / จ่ายแล้ว
        </Button>
      )}
      {e.status === 'PAID' && e.paidAt && (
        <span className="text-xs text-muted-foreground">{formatDate(e.paidAt)}</span>
      )}
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Reimbursements / เบิกค่าใช้จ่าย"
        description={
          user
            ? `${user.firmName} — Review and approve expense claims / ตรวจสอบและอนุมัติค่าใช้จ่าย — รอจ่ายรวม ฿${pendingTotal.toLocaleString()}`
            : `Review and approve expense claims / ตรวจสอบและอนุมัติค่าใช้จ่าย — รอจ่ายรวม ฿${pendingTotal.toLocaleString()}`
        }
      />

      <div className="-mx-3 mb-4 flex gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        {FILTERS.map((s) => (
          <button
            key={s || 'all'}
            type="button"
            onClick={() => setFilter(s)}
            className={cn(
              'shrink-0 rounded-lg px-3 py-1.5 text-sm transition-colors',
              filter === s
                ? 'bg-primary text-primary-foreground'
                : 'border border-border text-muted-foreground hover:bg-muted',
            )}
          >
            {s ? FILTER_LABELS[s] : 'All / ทั้งหมด'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
          <p className="text-destructive">{error}</p>
        </div>
      ) : expenses.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No reimbursement requests / ยังไม่มีรายการเบิกจ่าย
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="space-y-3 lg:hidden">
            {expenses.map((e) => (
              <Card key={e.id}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{e.user.firstName} {e.user.lastName}</p>
                      {e.case ? (
                        <Link href={`/cases/${e.case.id}`} className="text-sm text-primary hover:underline">
                          {e.case.ownRef}
                        </Link>
                      ) : (
                        <p className="text-sm text-muted-foreground">General / ทั่วไป</p>
                      )}
                    </div>
                    <ExpenseStatusBadge status={e.status} />
                  </div>
                  <div>
                    <p className="text-sm">{e.description}</p>
                    {e.category && <p className="text-xs text-muted-foreground">{e.category}</p>}
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-lg font-semibold">฿{e.amount.toLocaleString()}</p>
                    <ActionButtons e={e} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Desktop table */}
          <Card className="hidden lg:block">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lawyer / ทนาย</TableHead>
                    <TableHead>Case / คดี</TableHead>
                    <TableHead>รายการ</TableHead>
                    <TableHead>Amount / จำนวนเงิน</TableHead>
                    <TableHead>Status / สถานะ</TableHead>
                    <TableHead>Actions / การดำเนินการ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenses.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell>{e.user.firstName} {e.user.lastName}</TableCell>
                      <TableCell>
                        {e.case ? (
                          <Link href={`/cases/${e.case.id}`} className="text-primary hover:underline">
                            {e.case.ownRef}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">General / ทั่วไป</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <p>{e.description}</p>
                        {e.category && <p className="text-xs text-muted-foreground">{e.category}</p>}
                      </TableCell>
                      <TableCell className="font-medium">฿{e.amount.toLocaleString()}</TableCell>
                      <TableCell><ExpenseStatusBadge status={e.status} /></TableCell>
                      <TableCell><ActionButtons e={e} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
