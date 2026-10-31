'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { api, type CashAdvanceExpenseItem, type CashAdvanceReconciliationItem } from '@/lib/api';
import { canReturnCashAdvance, canSettleCashAdvance } from '@/lib/cash-advance';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { MoneyInput } from '@/components/ui/MoneyInput';
import { InlineEmptyState, PageLoading } from '@/components/ui/misc';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

export function CashAdvanceReconciliation({ token, onBusyChange }: { token: string; onBusyChange: (busy: boolean) => void }) {
  const [status, setStatus] = useState<'open' | 'settled'>('open');
  const [rows, setRows] = useState<CashAdvanceReconciliationItem[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const refresh = async () => {
    setLoading(true);
    setError('');
    try {
      setRows(await api.getCashAdvanceReconciliation(token, status));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'โหลดเงินทดรองไม่สำเร็จ');
      throw err;
    } finally {
      setLoading(false);
    }
  };
  const changeBusy = (value: boolean) => { setBusy(value); onBusyChange(value); };

  useEffect(() => {
    let active = true;
    setLoading(true);
    setRows([]);
    setError('');
    api.getCashAdvanceReconciliation(token, status)
      .then((data) => { if (active) setRows(data); })
      .catch((err) => { if (active) setError(err instanceof Error ? err.message : 'โหลดเงินทดรองไม่สำเร็จ'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, status]);

  return (
    <div className="space-y-4">
      <fieldset disabled={busy} className="min-w-0">
        <legend className="sr-only">สถานะเงินทดรอง</legend>
        <Tabs value={status} onValueChange={(value) => { setStatus(value === 'settled' ? 'settled' : 'open'); setExpandedId(null); }}>
          <TabsList>
            <TabsTrigger value="open">ค้าง</TabsTrigger>
            <TabsTrigger value="settled">ปิดแล้ว</TabsTrigger>
          </TabsList>
        </Tabs>
      </fieldset>
      {error && <LoadFailed message={error} onRetry={() => { void refresh().catch(() => {}); }} />}
      {loading && rows.length === 0 ? <PageLoading title="กำลังโหลดเงินทดรอง" lines={4} />
        : rows.length === 0 ? !error && <InlineEmptyState title="ไม่มีเงินทดรองในสถานะนี้" /> : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ผู้รับ</TableHead>
              <TableHead>วันจ่าย</TableHead>
              <TableHead className="text-right">ยอดจ่าย</TableHead>
              <TableHead className="text-right">ใช้ไป</TableHead>
              <TableHead className="text-right">คืนแล้ว</TableHead>
              <TableHead className="text-right">คงเหลือ</TableHead>
              <TableHead className="text-right">ไม่มีไฟล์ใบเสร็จ</TableHead>
              <TableHead className="text-right">ค่าธรรมเนียมศาลไม่มีเลขที่ใบเสร็จ</TableHead>
              <TableHead>สถานะ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((advance) => {
              const open = expandedId === advance.id;
              return (
                <Fragment key={advance.id}>
                  <TableRow>
                    <TableCell>
                      <button type="button" className="flex min-h-11 items-center gap-2 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        disabled={busy}
                        aria-expanded={open} aria-controls={`advance-${advance.id}`}
                        onClick={() => setExpandedId(open ? null : advance.id)}>
                        {open ? <ChevronDown className="h-4 w-4 shrink-0" aria-hidden /> : <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />}
                        {advance.user.firstName} {advance.user.lastName}
                      </button>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{formatDate(advance.issuedAt)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(advance.amount)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(advance.spent)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(advance.returnedAmount)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(advance.remaining)}</TableCell>
                    <TableCell className="text-right tabular-nums">{advance.missingReceiptFiles}</TableCell>
                    <TableCell className="text-right tabular-nums">{advance.courtFeesMissingReceiptNo}</TableCell>
                    <TableCell><Badge variant={advance.settledAt ? 'success' : 'warning'}>{advance.settledAt ? 'ปิดแล้ว' : 'ค้าง'}</Badge></TableCell>
                  </TableRow>
                  {open && (
                    <TableRow id={`advance-${advance.id}`}>
                      <TableCell colSpan={9} className="bg-muted/30">
                        <AdvanceDetails token={token} advance={advance} busy={busy || loading || !!error} onBusyChange={changeBusy} onRefresh={refresh} />
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function AdvanceDetails({ token, advance, busy, onBusyChange, onRefresh }: {
  token: string;
  advance: CashAdvanceReconciliationItem;
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
  onRefresh: () => Promise<void>;
}) {
  const [expenses, setExpenses] = useState<CashAdvanceExpenseItem[] | null>(null);
  const [receiptNumbers, setReceiptNumbers] = useState<Record<string, string>>({});
  const [expenseRevision, setExpenseRevision] = useState(0);
  const [amount, setAmount] = useState('');
  const pending = useRef(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setError('');
    api.listCashAdvanceExpenses(token, advance.id)
      .then((data) => {
        if (!active) return;
        setExpenses(data);
        setReceiptNumbers(Object.fromEntries(data.map((expense) => [expense.id, expense.officialReceiptNo ?? ''])));
      })
      .catch((err) => { if (active) setError(err instanceof Error ? err.message : 'โหลดค่าใช้จ่ายไม่สำเร็จ'); });
    return () => { active = false; };
  }, [token, advance.id, expenseRevision]);

  const perform = async (action: () => Promise<unknown>) => {
    if (busy || pending.current) return;
    pending.current = true;
    onBusyChange(true);
    setError('');
    try {
      await action();
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ กรุณาลองใหม่');
    } finally {
      pending.current = false;
      onBusyChange(false);
    }
  };

  if (!expenses) return error ? <LoadFailed message={error} onRetry={() => setExpenseRevision((value) => value + 1)} /> : <PageLoading title="กำลังโหลดค่าใช้จ่าย" lines={2} />;

  return (
    <div className="space-y-4">
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {expenses.length === 0 ? <InlineEmptyState title="ยังไม่มีค่าใช้จ่ายจากเงินทดรองนี้" /> : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>วันที่</TableHead>
              <TableHead>รายการ</TableHead>
              <TableHead>หมวด</TableHead>
              <TableHead className="text-right">จำนวนเงิน</TableHead>
              <TableHead>ไฟล์ใบเสร็จ</TableHead>
              <TableHead>เลขที่ใบเสร็จศาล</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {expenses.map((expense) => (
              <TableRow key={expense.id}>
                <TableCell className="whitespace-nowrap">{formatDate(expense.date)}</TableCell>
                <TableCell>{expense.description}</TableCell>
                <TableCell>{expense.category ?? '—'}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCurrency(expense.amount)}</TableCell>
                <TableCell>{expense.receiptFilename ?? 'ไม่มีไฟล์ใบเสร็จ'}</TableCell>
                <TableCell>
                  {expense.category === 'ค่าธรรมเนียมศาล' ? (
                    <form className="flex min-w-64 items-center gap-2" onSubmit={(event) => {
                      event.preventDefault();
                      const receiptNo = receiptNumbers[expense.id].trim() || null;
                      void perform(async () => {
                        await api.updateExpenseReceiptNo(token, expense.id, receiptNo);
                        setExpenses((current) => current?.map((row) => row.id === expense.id ? { ...row, officialReceiptNo: receiptNo } : row) ?? null);
                        setReceiptNumbers((current) => ({ ...current, [expense.id]: receiptNo ?? '' }));
                      });
                    }}>
                      <Input aria-label={`เลขที่ใบเสร็จศาล: ${expense.description}`} maxLength={100} disabled={busy}
                        value={receiptNumbers[expense.id]} onChange={(event) => setReceiptNumbers({ ...receiptNumbers, [expense.id]: event.target.value })} />
                      <Button type="submit" size="sm" variant="outline" disabled={busy}>บันทึก</Button>
                    </form>
                  ) : expense.officialReceiptNo || '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {!advance.settledAt && (
        <div className="flex flex-wrap items-end gap-3 border-t pt-4">
          <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => {
            event.preventDefault();
            if (canReturnCashAdvance(advance, Number(amount))) {
              void perform(async () => { await api.returnCashAdvance(token, advance.id, Number(amount)); setAmount(''); });
            }
          }}>
            <div className="space-y-1.5">
              <label htmlFor={`return-${advance.id}`} className="block text-sm font-medium">ยอดเงินคืน (บาท)</label>
              <MoneyInput id={`return-${advance.id}`} required min={0.01} max={advance.remaining}
                disabled={busy || advance.remaining === 0} value={amount} onValueChange={setAmount} />
            </div>
            <Button type="submit" variant="outline" disabled={busy || !canReturnCashAdvance(advance, Number(amount))}>บันทึกเงินคืน</Button>
          </form>
          <Button type="button" disabled={busy || !canSettleCashAdvance(advance)}
            onClick={() => { if (canSettleCashAdvance(advance)) void perform(() => api.settleCashAdvance(token, advance.id)); }}>ปิดยอด</Button>
          {advance.remaining > 0 && <p className="text-sm text-muted-foreground">ใช้หรือคืนเงินให้ครบก่อนปิดยอด</p>}
        </div>
      )}
    </div>
  );
}
