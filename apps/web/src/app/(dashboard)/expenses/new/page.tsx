'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, X } from 'lucide-react';
import {
  EXPENSE_CATEGORIES,
  ExpenseStatus,
  MONEY_HINT,
  MONEY_MAX,
  MONEY_MIN,
} from '@lawfirm/shared';
import { useAuth } from '@/lib/auth';
import { api, ApiError, CaseListItem, CashAdvanceItem } from '@/lib/api';
import { PageHeader } from '@/components/samnuan/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SelectField, TextField } from '@/components/ui/form-fields';
import { MoneyInput } from '@/components/ui/MoneyInput';
import { DocumentDropZone } from '@/components/DocumentDropZone';
import { useDashboardT } from '@/components/landing/LocaleProvider';
import { formatCurrency } from '@/lib/utils';

const RECEIPT_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,application/pdf';

export default function NewExpensePage() {
  const d = useDashboardT();
  const { token } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const caseIdParam = searchParams.get('caseId') ?? '';
  const [cases, setCases] = useState<CaseListItem[]>([]);
  const [advances, setAdvances] = useState<CashAdvanceItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [form, setForm] = useState({
    amount: '',
    description: '',
    category: EXPENSE_CATEGORIES[0] as string,
    expensePurpose: '',
    caseId: '',
    paidFromAdvanceId: '',
  });

  useEffect(() => {
    if (!token) return;
    api.getCases(token).then(setCases).catch(() => setCases([]));
    api.listMyCashAdvances(token).then(setAdvances).catch(() => setAdvances([]));
  }, [token]);

  const selectedAdvance = advances.find((a) => a.id === form.paidFromAdvanceId);
  const advanceAmountExceeded =
    !!selectedAdvance && !!form.amount && parseFloat(form.amount) > selectedAdvance.remaining;

  useEffect(() => {
    if (!caseIdParam) return;
    setForm((current) =>
      current.caseId === caseIdParam ? current : { ...current, caseId: caseIdParam },
    );
  }, [caseIdParam]);

  useEffect(() => {
    if (!receipt) {
      setReceiptPreview(null);
      return;
    }
    if (receipt.type.startsWith('image/')) {
      const url = URL.createObjectURL(receipt);
      setReceiptPreview(url);
      return () => URL.revokeObjectURL(url);
    }
    setReceiptPreview(null);
  }, [receipt]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (advanceAmountExceeded) {
      setError(d.expenses.advanceExceeded);
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await api.createStandaloneExpense(
        token,
        {
          amount: parseFloat(form.amount),
          description: form.description,
          category: form.category,
          expensePurpose: form.expensePurpose || undefined,
          caseId: form.caseId || undefined,
          paidFromAdvanceId: form.paidFromAdvanceId || undefined,
          // Advance-covered costs are recorded as settled server-side regardless
          // of this — DRAFT only applies to the normal self-pay/reimburse path.
          status: ExpenseStatus.DRAFT,
        },
        receipt ?? undefined,
      );
      router.push('/expenses');
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : d.expenses.createFailed,
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full">
      <Link href="/expenses" className="inline-flex min-h-11 items-center gap-1 text-sm text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {d.expenses.back}
      </Link>
      <PageHeader
        title={d.expenses.newTitle}
        description={d.expenses.newDescription}
      />

      <Card>
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="expense-amount" className="block text-sm font-medium">{d.expenses.amount}<span aria-hidden="true" className="ml-1 text-destructive">*</span></label>
              <MoneyInput
                id="expense-amount"
                aria-describedby="expense-amount-hint"
                required
                min={MONEY_MIN}
                max={MONEY_MAX}
                title={MONEY_HINT}
                placeholder={d.expenses.amount}
                value={form.amount}
                onValueChange={(next) => setForm({ ...form, amount: next })}
                className="h-10 tabular-nums"
              />
              <p id="expense-amount-hint" className="text-xs text-muted-foreground">{MONEY_HINT}</p>
            </div>

            <SelectField
              label={d.expenses.category}
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </SelectField>

            <TextField
              label={d.expenses.descriptionField}
              required
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />

            <TextField
              label={d.expenses.purpose}
              value={form.expensePurpose}
              onChange={(e) => setForm({ ...form, expensePurpose: e.target.value })}
            />

            {advances.length > 0 && (
              <SelectField
                label={d.expenses.paidFrom}
                containerClassName="md:col-span-2"
                error={advanceAmountExceeded ? d.expenses.advanceExceeded : undefined}
                value={form.paidFromAdvanceId}
                onChange={(e) => setForm({ ...form, paidFromAdvanceId: e.target.value })}
              >
                  <option value="">{d.expenses.paidFromSelf}</option>
                  {advances.map((a) => (
                    <option key={a.id} value={a.id}>
                      {d.expenses.paidFromAdvance} — {d.expenses.remaining} {formatCurrency(a.remaining)}
                      {a.note ? ` (${a.note})` : ''}
                    </option>
                  ))}
              </SelectField>
            )}

            <SelectField
              label={d.expenses.caseField}
              containerClassName="md:col-span-2"
              hint={caseIdParam && form.caseId === caseIdParam ? 'เลือกคดีจากหน้าที่แล้วให้อัตโนมัติ' : undefined}
              value={form.caseId}
              onChange={(e) => setForm({ ...form, caseId: e.target.value })}
            >
              <option value="">{d.expenses.noCase}</option>
              {cases.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.ownRef} — {c.title}
                </option>
              ))}
            </SelectField>

            <div className="md:col-span-2">
              <p className="text-sm font-medium">{d.expenses.receipt}</p>
              <div className="mt-2 space-y-3">
                <DocumentDropZone
                  accept={RECEIPT_ACCEPT}
                  disabled={submitting}
                  label={receipt ? receipt.name : 'ลากรูปใบเสร็จมาวาง หรือคลิกเลือกไฟล์'}
                  hint={d.expenses.receiptHint}
                  onFile={(file) => setReceipt(file)}
                />
                {receipt && (
                  <Button type="button" variant="outline" size="sm" onClick={() => setReceipt(null)}>
                    <X className="h-3.5 w-3.5" aria-hidden />
                    {d.expenses.removeReceipt}
                  </Button>
                )}
              </div>
              {receiptPreview && (
                <div className="mt-3">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">{d.expenses.receiptPreview}</p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={receiptPreview}
                    alt={d.expenses.receiptPreview}
                    className="max-h-48 rounded-lg border border-border object-contain"
                  />
                </div>
              )}
              {receipt && !receiptPreview && (
                <p className="mt-2 text-sm text-muted-foreground">{receipt.name}</p>
              )}
            </div>

            {error && <p role="alert" className="text-sm text-destructive md:col-span-2">{error}</p>}

            <div className="flex flex-wrap justify-end gap-3 border-t pt-4 md:col-span-2">
              <Button type="button" variant="outline" onClick={() => router.push('/expenses')}>
                {d.common.cancel}
              </Button>
              <Button
                type="submit"
                disabled={submitting || !form.amount || !form.description.trim() || advanceAmountExceeded}
              >
                {submitting ? d.expenses.submitting : d.expenses.saveDraft}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
