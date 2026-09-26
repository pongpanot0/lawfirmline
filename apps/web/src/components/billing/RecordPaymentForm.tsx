'use client';

import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { ThaiDateInput } from '@/components/ui/ThaiDateInput';

const METHOD_LABELS: Record<string, string> = {
  TRANSFER: 'โอนเงิน',
  CHEQUE: 'เช็ค',
  CASH: 'เงินสด',
  OTHER: 'อื่นๆ',
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

/** ฟอร์มบันทึกรับเงินแบบ inline — เปิดจากปุ่ม "บันทึกรับเงิน" ในตาราง receivables */
export function RecordPaymentForm({
  invoiceId,
  outstanding,
  onRecorded,
  onCancel,
}: {
  invoiceId: string;
  outstanding: number;
  onRecorded: () => void;
  onCancel: () => void;
}) {
  const { token } = useAuth();
  const [amount, setAmount] = useState(String(outstanding));
  const [method, setMethod] = useState<'TRANSFER' | 'CHEQUE' | 'CASH' | 'OTHER'>('TRANSFER');
  const [receivedAt, setReceivedAt] = useState(today());
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token) return;
    const value = parseFloat(amount);
    if (!value || value <= 0) {
      setError('กรอกจำนวนเงินให้ถูกต้อง');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await api.recordInvoicePayment(token, invoiceId, {
        amount: value,
        method,
        receivedAt,
        note: note.trim() || undefined,
      });
      onRecorded();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'บันทึกรับเงินไม่สำเร็จ กรุณาลองใหม่');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-muted/30 p-3"
    >
      <label className="text-sm">
        <span className="mb-1 block text-xs text-muted-foreground">จำนวนเงิน</span>
        <input
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="h-9 w-32 rounded-lg border border-input bg-background px-2 text-sm"
        />
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-xs text-muted-foreground">วิธีชำระ</span>
        <select
          value={method}
          onChange={(e) => setMethod(e.target.value as typeof method)}
          className="h-9 rounded-lg border border-input bg-background px-2 text-sm"
        >
          {Object.entries(METHOD_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-xs text-muted-foreground">วันที่รับเงิน</span>
        <ThaiDateInput value={receivedAt} onChange={setReceivedAt} />
      </label>
      <label className="min-w-40 flex-1 text-sm">
        <span className="mb-1 block text-xs text-muted-foreground">หมายเหตุ</span>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm"
        />
      </label>
      {error && (
        <p role="alert" className="w-full text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={submitting}>
          {submitting ? 'กำลังบันทึก…' : 'บันทึก'}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel} disabled={submitting}>
          ยกเลิก
        </Button>
      </div>
    </form>
  );
}
