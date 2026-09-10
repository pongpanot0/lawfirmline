'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ImagePlus, X } from 'lucide-react';
import {
  EXPENSE_CATEGORIES,
  ExpenseStatus,
  MONEY_HINT,
  MONEY_MAX,
  MONEY_MIN,
  MONEY_STEP,
} from '@lawfirm/shared';
import { useAuth } from '@/lib/auth';
import { api, ApiError, CaseItem } from '@/lib/api';
import { PageHeader } from '@/components/samnuan/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDashboardT } from '@/components/landing/LocaleProvider';

const RECEIPT_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,application/pdf';

export default function NewExpensePage() {
  const d = useDashboardT();
  const { token } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const caseIdParam = searchParams.get('caseId') ?? '';
  const [cases, setCases] = useState<CaseItem[]>([]);
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
  });

  useEffect(() => {
    if (!token) return;
    api.getCases(token).then(setCases).catch(() => setCases([]));
  }, [token]);

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

  const handleReceiptChange = (file: File | null) => {
    setReceipt(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
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
      <Link href="/expenses" className="text-sm text-primary hover:underline">
        {d.expenses.back}
      </Link>
      <PageHeader
        title={d.expenses.newTitle}
        description={d.expenses.newDescription}
      />

      <Card>
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium">{d.expenses.amount} *</label>
              <Input
                required
                type="number"
                step={MONEY_STEP}
                min={MONEY_MIN}
                max={MONEY_MAX}
                title={MONEY_HINT}
                placeholder={d.expenses.amount}
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                className="mt-1"
              />
              <p className="mt-1 text-xs text-muted-foreground">{MONEY_HINT}</p>
            </div>

            <div>
              <label className="text-sm font-medium">{d.expenses.category}</label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="mt-1 h-9 w-full rounded-lg border border-input bg-card px-3 text-sm"
              >
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-medium">{d.expenses.descriptionField} *</label>
              <Input
                required
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-sm font-medium">{d.expenses.purpose}</label>
              <Input
                value={form.expensePurpose}
                onChange={(e) => setForm({ ...form, expensePurpose: e.target.value })}
                className="mt-1"
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-sm font-medium">{d.expenses.caseField}</label>
              <select
                value={form.caseId}
                onChange={(e) => setForm({ ...form, caseId: e.target.value })}
                className="mt-1 h-9 w-full rounded-lg border border-input bg-card px-3 text-sm"
              >
                <option value="">{d.expenses.noCase}</option>
                {cases.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.ownRef} — {c.title}
                  </option>
                ))}
              </select>
              {caseIdParam && form.caseId === caseIdParam && (
                <p className="mt-1 text-xs text-muted-foreground">
                  เลือกคดีจากหน้าที่แล้วให้อัตโนมัติ เปลี่ยนได้ถ้าต้องการ
                </p>
              )}
            </div>

            <div className="md:col-span-2">
              <label className="text-sm font-medium">{d.expenses.receipt}</label>
              <div className="mt-2 flex flex-wrap items-start gap-3">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-input px-4 py-3 text-sm font-medium hover:bg-accent">
                  <ImagePlus className="h-4 w-4" />
                  {receipt ? receipt.name : d.expenses.receipt}
                  <input
                    type="file"
                    accept={RECEIPT_ACCEPT}
                    className="sr-only"
                    onChange={(e) => handleReceiptChange(e.target.files?.[0] ?? null)}
                  />
                </label>
                {receipt && (
                  <Button type="button" variant="outline" size="sm" onClick={() => setReceipt(null)}>
                    <X className="h-3.5 w-3.5" />
                    {d.expenses.removeReceipt}
                  </Button>
                )}
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">{d.expenses.receiptHint}</p>
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

            {error && <p className="text-sm text-destructive md:col-span-2">{error}</p>}

            <div className="flex gap-3 md:col-span-2">
              <Button type="button" variant="outline" onClick={() => router.push('/expenses')}>
                {d.common.cancel}
              </Button>
              <Button type="submit" disabled={submitting || !form.amount || !form.description.trim()}>
                {submitting ? d.expenses.submitting : d.expenses.saveDraft}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
