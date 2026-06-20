'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { ExpenseStatus } from '@lawfirm/shared';
import { Role } from '@lawfirm/shared';
import { useAuth } from '@/lib/auth';
import { api, ExpenseItem } from '@/lib/api';
import { PageHeader } from '@/components/lexflow/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ExpenseStatusBadge } from '@/components/ExpenseStatusBadge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

const FILTERS = ['', 'PENDING', 'APPROVED', 'PAID', 'REJECTED'] as const;

export default function ReimbursementsPage() {
  const { token, user } = useAuth();
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const load = () => {
    if (!token) return;
    api
      .getExpenses(token, filter || undefined)
      .then(setExpenses)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    setLoading(true);
    load();
  }, [token, filter]);

  const updateStatus = async (id: string, status: ExpenseStatus) => {
    if (!token) return;
    await api.updateExpenseStatus(token, id, status);
    load();
  };

  if (user?.role !== Role.ADMIN) {
    return <p className="text-destructive">Access denied. Admin only.</p>;
  }

  const pendingTotal = expenses
    .filter((e) => e.status === 'PENDING' || e.status === 'APPROVED')
    .reduce((sum, e) => sum + e.amount, 0);

  const ActionButtons = ({ e }: { e: ExpenseItem }) => (
    <div className="flex flex-wrap gap-1.5">
      {e.status === 'PENDING' && (
        <>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => updateStatus(e.id, 'APPROVED' as ExpenseStatus)}>
            Approve
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs text-destructive" onClick={() => updateStatus(e.id, 'REJECTED' as ExpenseStatus)}>
            Reject
          </Button>
        </>
      )}
      {e.status === 'APPROVED' && (
        <Button size="sm" className="h-7 text-xs" onClick={() => updateStatus(e.id, 'PAID' as ExpenseStatus)}>
          Mark Paid
        </Button>
      )}
      {e.status === 'PAID' && e.paidAt && (
        <span className="text-xs text-muted-foreground">{new Date(e.paidAt).toLocaleDateString()}</span>
      )}
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Reimbursements / เบิกค่าใช้จ่าย"
        description={`Review and approve expense claims — รอจ่ายรวม ฿${pendingTotal.toLocaleString()}`}
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
            {s || 'All'}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : expenses.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No reimbursement requests
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
                          {e.case.caseNumber}
                        </Link>
                      ) : (
                        <p className="text-sm text-muted-foreground">General</p>
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
                    <TableHead>Lawyer</TableHead>
                    <TableHead>Case</TableHead>
                    <TableHead>รายการ</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenses.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell>{e.user.firstName} {e.user.lastName}</TableCell>
                      <TableCell>
                        {e.case ? (
                          <Link href={`/cases/${e.case.id}`} className="text-primary hover:underline">
                            {e.case.caseNumber}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">General</span>
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
