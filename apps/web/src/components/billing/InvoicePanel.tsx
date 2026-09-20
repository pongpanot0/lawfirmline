'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  api,
  ClientItem,
  CustomerShareItem,
  InvoiceDraft,
  InvoiceItem,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { allocateShares } from '@/lib/invoice-split';
import { buildBillingDocHtml, openBillingDocWindow } from '@/lib/billing-doc';
import { formatCurrency } from '@/lib/utils';
import { InlineEmptyState } from '@/components/ui/misc';
import { CustomerSelect } from '@/components/billing/CustomerSelect';
import { SideDrawer } from '@/components/ui/SideDrawer';

const INVOICE_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'ร่าง',
  SENT: 'ส่งแล้ว',
  PAID: 'ชำระแล้ว',
};

/**
 * ใบแจ้งหนี้คือเอกสารที่ส่งให้ลูกค้า จึงออกได้ทั้งจากคดี จากเรื่องที่รับเข้ามา
 * และออกเปล่าให้ลูกค้าดูก่อนจะมีทั้งสองอย่าง — แผงเดียวใช้ได้ทั้งสามที่
 */
export type InvoiceTarget = { caseId?: string; intakeId?: string };

export function InvoicePanel({
  target,
  customers,
  onChanged,
}: {
  target: InvoiceTarget;
  /** ลูกค้า (ผู้ว่าจ้าง) ของงานนี้ — ว่างได้เมื่อออกใบเปล่า แล้วจะให้เลือกเอง */
  customers: CustomerShareItem[];
  /** เรียกเมื่อออกบิลสำเร็จ ให้หน้าแม่โหลดรายการเบิก/เวลาใหม่ */
  onChanged?: () => void;
}) {
  const { token, user } = useAuth();
  const { caseId, intakeId } = target;
  const standalone = !caseId && !intakeId;

  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [draft, setDraft] = useState<InvoiceDraft | null>(null);
  const [clients, setClients] = useState<ClientItem[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [dueAt, setDueAt] = useState('');
  const [pickedTimeIds, setPickedTimeIds] = useState<string[]>([]);
  const [pickedExpenseIds, setPickedExpenseIds] = useState<string[]>([]);
  const [items, setItems] = useState<{ description: string; quantity: string; unitPrice: string }[]>([]);
  const [shareOverrides, setShareOverrides] = useState<Record<string, string>>({});
  const [billToId, setBillToId] = useState('');

  const handlePrint = async (invoiceId: string, kind: 'INVOICE' | 'RECEIPT') => {
    if (!token) return;
    setError('');
    try {
      const data = await api.getInvoicePrintData(token, invoiceId);
      const lines = [
        ...data.lineItems.map((l) => ({ description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, amount: l.amount })),
        ...data.timeEntries.map((t) => ({ description: t.description || 'ค่าทนายความ (ตามเวลา)', quantity: t.hours, unitPrice: t.rate, amount: t.amount })),
        ...data.expenses.map((e) => ({ description: e.description, quantity: 1, unitPrice: e.amount, amount: e.amount })),
      ];
      const ok = openBillingDocWindow(
        buildBillingDocHtml({
          kind,
          firmName: user?.firmName ?? '',
          invoiceNumber: data.invoiceNumber,
          issuedAt: data.issuedAt,
          dueAt: data.dueAt,
          matterLabel: data.case ? `${data.case.ownRef} — ${data.case.title}` : (data.intake?.title ?? ''),
          billTo: data.billToCustomer ?? null,
          lines,
          totalAmount: data.totalAmount,
        }),
      );
      if (!ok) setError('เปิดหน้าต่างพิมพ์ไม่ได้ กรุณาอนุญาต popup สำหรับเว็บไซต์นี้');
    } catch {
      setError('โหลดข้อมูลใบแจ้งหนี้ไม่สำเร็จ กรุณาลองใหม่');
    }
  };

  const load = useCallback(() => {
    if (!token) return;
    const fetchInvoices = caseId
      ? api.getInvoices(token, caseId)
      : intakeId
        ? api.getIntakeInvoices(token, intakeId)
        : api.getStandaloneInvoices(token);
    fetchInvoices.then(setInvoices).catch(() => setInvoices([]));

    // งานที่รอเก็บเงินมีได้เฉพาะในคดี
    if (caseId) {
      api
        .getInvoiceDraft(token, caseId)
        .then((d) => {
          setDraft(d);
          setPickedTimeIds(d.timeEntries.map((e) => e.id));
          setPickedExpenseIds(d.expenses.map((e) => e.id));
        })
        .catch(() => setDraft(null));
    }
    // ใบเปล่าต้องเลือกลูกค้าเอง เพราะไม่มีงานให้อ้างอิง
    if (standalone) {
      api.getClients(token).then(setClients).catch(() => setClients([]));
    }
  }, [token, caseId, intakeId, standalone]);

  useEffect(() => {
    load();
  }, [load]);

  const pickedTime = (draft?.timeEntries ?? []).filter((e) => pickedTimeIds.includes(e.id));
  const pickedExpenses = (draft?.expenses ?? []).filter((e) => pickedExpenseIds.includes(e.id));
  const total =
    pickedTime.reduce((sum, e) => sum + e.amount, 0) +
    pickedExpenses.reduce((sum, e) => sum + e.amount, 0) +
    items.reduce(
      (sum, item) => sum + (parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0),
      0,
    );

  // สัดส่วนที่ยังไม่ตกลงกัน ถือว่าหารเท่ากับรายอื่น — ตรงกับฝั่ง API
  const shareOf = (customer: CustomerShareItem) => {
    const override = shareOverrides[customer.customerId];
    if (override !== undefined && override !== '') return parseFloat(override) || 0;
    return customer.sharePercent ?? 100 / customers.length;
  };
  const splitPreview = allocateShares(total, customers.map(shareOf));

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token) return;
    setError('');
    const lineItems = items
      .filter((item) => item.description.trim() && parseFloat(item.unitPrice) > 0)
      .map((item) => ({
        description: item.description.trim(),
        quantity: parseFloat(item.quantity) || 1,
        unitPrice: parseFloat(item.unitPrice),
      }));
    // ใบที่ออกจากงานต้องมีอะไรให้เก็บเงิน ส่วนใบเปล่าปล่อยว่างไว้ก่อนได้
    if (!standalone && !lineItems.length && !pickedTimeIds.length && !pickedExpenseIds.length) {
      setError('เลือกงานที่จะเก็บเงิน หรือเพิ่มรายการเอง');
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        lineItems,
        dueAt: dueAt || undefined,
        timeEntryIds: caseId && pickedTimeIds.length ? pickedTimeIds : undefined,
        expenseIds: caseId && pickedExpenseIds.length ? pickedExpenseIds : undefined,
        splits:
          customers.length > 1
            ? customers.map((c) => ({ customerId: c.customerId, sharePercent: shareOf(c) }))
            : undefined,
        billToCustomerId: standalone && billToId ? billToId : undefined,
      };
      if (caseId) await api.createInvoice(token, caseId, payload);
      else if (intakeId) await api.createIntakeInvoice(token, intakeId, payload);
      else await api.createStandaloneInvoice(token, payload);

      setItems([]);
      setDueAt('');
      setShareOverrides({});
      setBillToId('');
      setShowForm(false);
      load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ออกใบแจ้งหนี้ไม่สำเร็จ กรุณาลองใหม่');
    } finally {
      setSubmitting(false);
    }
  };

  const hasWork = Boolean(draft?.timeEntries.length || draft?.expenses.length);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-semibold">ใบแจ้งหนี้</h2>
        <button
          type="button"
          onClick={() => {
            setShowForm(true);
            setError('');
          }}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
        >
          {standalone ? '+ ออกใบเปล่า' : '+ ออกใบแจ้งหนี้'}
        </button>
      </div>

      <SideDrawer
        open={showForm}
        title={standalone ? 'ออกใบแจ้งหนี้เปล่า' : 'ออกใบแจ้งหนี้'}
        onClose={() => setShowForm(false)}
      >
        <form onSubmit={handleSubmit} className="space-y-3">
          {caseId &&
            (hasWork ? (
              <div className="space-y-1">
                <p className="text-sm font-medium">งานในคดีที่ยังไม่ได้เก็บเงิน</p>
                {draft!.timeEntries.map((entry) => (
                  <label key={entry.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={pickedTimeIds.includes(entry.id)}
                      onChange={(e) =>
                        setPickedTimeIds((ids) =>
                          e.target.checked ? [...ids, entry.id] : ids.filter((i) => i !== entry.id),
                        )
                      }
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {entry.description || 'ค่าทนายความ'}
                      <span className="text-slate-400">
                        {' '}
                        · {entry.hours} ชม. × {formatCurrency(entry.rate)}
                      </span>
                    </span>
                    <span className="font-medium">{formatCurrency(entry.amount)}</span>
                  </label>
                ))}
                {draft!.expenses.map((expense) => (
                  <label key={expense.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={pickedExpenseIds.includes(expense.id)}
                      onChange={(e) =>
                        setPickedExpenseIds((ids) =>
                          e.target.checked ? [...ids, expense.id] : ids.filter((i) => i !== expense.id),
                        )
                      }
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {expense.description}
                      <span className="text-slate-400"> · ค่าใช้จ่าย</span>
                    </span>
                    <span className="font-medium">{formatCurrency(expense.amount)}</span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                คดีนี้ยังไม่มีบันทึกเวลาหรือค่าใช้จ่ายที่รอเก็บเงิน
                {draft?.agreedFee ? ` — ค่าจ้างที่ตกลงไว้คือ ${formatCurrency(draft.agreedFee)}` : ''}
              </p>
            ))}

          {standalone && (
            <CustomerSelect
              id="invoice-billTo"
              label="ลูกค้าที่วางบิล"
              value={billToId}
              clients={clients}
              onChange={setBillToId}
              onCreated={(client) => setClients((rows) => [...rows, client])}
            />
          )}

          <div className="space-y-2">
            {items.map((item, index) => (
              <div key={index} className="flex flex-wrap items-center gap-2">
                <input
                  aria-label={`รายการที่ ${index + 1}`}
                  value={item.description}
                  onChange={(e) =>
                    setItems((rows) =>
                      rows.map((r, i) => (i === index ? { ...r, description: e.target.value } : r)),
                    )
                  }
                  placeholder="เช่น ค่าว่าความศาลชั้นต้น"
                  className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
                <input
                  aria-label={`จำนวนของรายการที่ ${index + 1}`}
                  value={item.quantity}
                  onChange={(e) =>
                    setItems((rows) =>
                      rows.map((r, i) => (i === index ? { ...r, quantity: e.target.value } : r)),
                    )
                  }
                  inputMode="decimal"
                  className="w-16 rounded-lg border border-slate-200 px-2 py-2 text-sm"
                />
                <input
                  aria-label={`ราคาต่อหน่วยของรายการที่ ${index + 1}`}
                  value={item.unitPrice}
                  onChange={(e) =>
                    setItems((rows) =>
                      rows.map((r, i) => (i === index ? { ...r, unitPrice: e.target.value } : r)),
                    )
                  }
                  inputMode="decimal"
                  placeholder="ราคา"
                  className="w-28 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
                {items.length > 1 && (
                  <button
                    type="button"
                    aria-label={`ลบรายการที่ ${index + 1}`}
                    onClick={() => setItems((rows) => rows.filter((_, i) => i !== index))}
                    className="px-1 text-sm text-slate-400"
                  >
                    ลบ
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                setItems((rows) => [
                  ...rows,
                  {
                    description: '',
                    quantity: '1',
                    // ไม่มีงานให้เก็บเงินและยังไม่เคยเพิ่มบรรทัดเอง ตั้งต้นด้วยค่าจ้างที่ตกลงไว้
                    unitPrice:
                      !rows.length && !pickedTime.length && !pickedExpenses.length && draft?.agreedFee
                        ? String(draft.agreedFee)
                        : '',
                  },
                ])
              }
              className="text-sm underline"
            >
              {caseId ? '+ เพิ่มรายการที่ไม่ได้อยู่ในคดี' : '+ เพิ่มรายการ'}
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
            <label className="text-sm text-slate-500">
              ครบกำหนดชำระ{' '}
              <input
                aria-label="ครบกำหนดชำระ"
                type="date"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                className="rounded-lg border border-slate-200 px-2 py-1 text-sm"
              />
            </label>
            <p className="text-sm">
              รวม <span className="font-semibold">{formatCurrency(total)}</span>
            </p>
          </div>

          {customers.length > 1 && (
            <div className="space-y-2 rounded-lg bg-slate-50 p-3">
              <p className="text-sm font-medium">แบ่งบิล {customers.length} ใบ</p>
              {customers.map((customer, index) => (
                <div key={customer.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{customer.customer.name}</span>
                  <input
                    aria-label={`สัดส่วนของ ${customer.customer.name}`}
                    value={shareOverrides[customer.customerId] ?? String(shareOf(customer))}
                    onChange={(e) =>
                      setShareOverrides((rows) => ({ ...rows, [customer.customerId]: e.target.value }))
                    }
                    inputMode="decimal"
                    className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-right text-sm"
                  />
                  <span className="text-slate-400">%</span>
                  <span className="w-28 text-right font-medium">
                    {formatCurrency(splitPreview[index] ?? 0)}
                  </span>
                </div>
              ))}
            </div>
          )}
          {customers.length === 1 && (
            <p className="text-sm text-slate-500">วางบิลที่ {customers[0].customer.name}</p>
          )}
          {customers.length === 0 && !standalone && (
            <p className="text-sm text-amber-600">
              งานนี้ยังไม่ได้ระบุลูกค้า (ผู้ว่าจ้าง) — ใบแจ้งหนี้จะออกโดยไม่ผูกกับใคร
            </p>
          )}

          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {submitting
              ? 'กำลังออก…'
              : customers.length > 1
                ? `ออกใบแจ้งหนี้ ${customers.length} ใบ`
                : 'ออกใบแจ้งหนี้'}
          </button>
        </form>
      </SideDrawer>

      <div className="space-y-2">
        {invoices.map((inv) => (
          <div
            key={inv.id}
            className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm"
          >
            <div className="min-w-0">
              <span className="font-medium">{inv.invoiceNumber}</span>
              {inv.billToCustomer && (
                <p className="truncate text-xs text-slate-400">{inv.billToCustomer.name}</p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p>฿{inv.totalAmount.toLocaleString()}</p>
                <p className="text-xs text-slate-400">
                  {INVOICE_STATUS_LABELS[inv.status] ?? inv.status}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handlePrint(inv.id, inv.status === 'PAID' ? 'RECEIPT' : 'INVOICE')}
                className="rounded-lg border px-2.5 py-1 text-xs font-medium hover:bg-accent"
              >
                {inv.status === 'PAID' ? 'พิมพ์ใบเสร็จ' : 'พิมพ์ใบแจ้งหนี้'}
              </button>
            </div>
          </div>
        ))}
        {invoices.length === 0 && (
          <InlineEmptyState
            title="ยังไม่มีใบแจ้งหนี้"
            description="ใบแจ้งหนี้ที่ออกจากงานนี้จะแสดงพร้อมสถานะการชำระเงิน"
          />
        )}
      </div>
    </div>
  );
}
