'use client';

import { useEffect, useState } from 'react';
import { api, ApiError, type DocumentTemplate } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { ThaiDateInput } from '@/components/ui/ThaiDateInput';
import { MoneyInput } from '@/components/ui/MoneyInput';
import { SideDrawer } from '@/components/ui/SideDrawer';
import { formatCurrency } from '@/lib/utils';
import { suggestWht } from '@/lib/billing-doc';

export function RecordPaymentForm({ invoiceId, invoiceNumber, customerName, clientType, outstanding, onRecorded, onCancel, allowPrint = false }: {
  invoiceId: string; invoiceNumber?: string; customerName?: string; clientType?: 'COMPANY' | 'INDIVIDUAL' | null; outstanding: number; allowPrint?: boolean; onRecorded: (receiptId?: string, printWindow?: Window) => void; onCancel: () => void;
}) {
  const { token } = useAuth();
  const [requestId] = useState(() => crypto.randomUUID());
  const [amount, setAmount] = useState(String(outstanding));
  const [method, setMethod] = useState<'TRANSFER' | 'PROMPTPAY' | 'CHEQUE' | 'CASH'>('TRANSFER');
  const [receivedAt, setReceivedAt] = useState(() => new Date().toLocaleDateString('en-CA'));
  const [whtEnabled, setWhtEnabled] = useState(clientType === 'COMPANY');
  const [rate, setRate] = useState<'0.03' | '0.01' | 'other'>('0.03');
  const [wht, setWht] = useState('0');
  const [certificate, setCertificate] = useState('');
  const [feeBase, setFeeBase] = useState<number | null>(null);
  const [invoiceTotal, setInvoiceTotal] = useState(0);
  const [error, setError] = useState('');
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [templateError, setTemplateError] = useState('');
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const withheld = whtEnabled ? Number(wht) : 0;
  useEffect(() => { if (whtEnabled && feeBase !== null && rate !== 'other' && invoiceTotal > 0) { setWht(suggestWht(Number(rate), feeBase, Number(amount) || 0, Number(wht) || 0, outstanding, invoiceTotal).toFixed(2)); } }, [amount, feeBase, whtEnabled, rate, invoiceTotal, outstanding]);
  useEffect(() => { if (!token) return; let active = true; api.getInvoicePrintData(token, invoiceId).then(data => { const base = data.lineItems.filter(l => l.taxClass !== 'DISBURSEMENT').reduce((sum, l) => sum + l.amount, 0) - (data.discountAmount ?? 0); if (active) { setFeeBase(Math.max(0, base)); setInvoiceTotal(data.totalAmount); if (clientType === 'COMPANY' && data.totalAmount > 0) setAmount((outstanding - Math.round(0.03 * Math.max(0, base) * outstanding / data.totalAmount * 100) / 100).toFixed(2)); } }).catch(() => { if (active) setFeeBase(null); }); return () => { active = false; }; }, [token, invoiceId, clientType, outstanding]);

  useEffect(() => {
    if (!token) return;
    let active = true;
    Promise.all([api.getInvoicePrintData(token, invoiceId), api.getBillingDocumentTemplates(token, 'RECEIPT')])
      .then(async ([invoice, list]) => {
        const resolved = await api.resolveDocumentTemplate(token, 'RECEIPT', invoice.billToCustomer?.id);
        if (active) { setTemplates(list); setTemplateId(resolved.templateId ?? ''); setTemplateError(''); }
      }).catch(() => { if (active) setTemplateError('โหลดเทมเพลตไม่สำเร็จ ปิดหน้าต่างแล้วลองใหม่'); }).finally(() => { if (active) setTemplatesLoading(false); });
    return () => { active = false; };
  }, [token, invoiceId]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token || submitting) return;
    const value = Number(amount);
    if (!receivedAt || !Number.isFinite(value) || value <= 0 || !Number.isFinite(withheld) || withheld < 0 || value + withheld > outstanding + 0.005) {
      setError('ระบุวันที่และยอดรับเงินให้ถูกต้อง โดยยอดรับเงินรวมภาษีหัก ณ ที่จ่ายต้องไม่เกินยอดค้าง');
      return;
    }
    const printRequested = (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'print';
    const printWindow = printRequested ? window.open('', '_blank') : null;
    if (printRequested && !printWindow) { setError('เปิดหน้าพิมพ์ไม่ได้ ให้อนุญาตป๊อปอัปแล้วลองใหม่อีกครั้ง'); return; }
    setSubmitting(true); setError('');
    try {
      const result = await api.recordInvoicePayment(token, invoiceId, {
        templateId: templateId || undefined, amount: value, method: method === 'PROMPTPAY' ? 'TRANSFER' : method, receivedAt,
        note: method === 'PROMPTPAY' ? 'พร้อมเพย์' : undefined, createRequestId: requestId,
        whtAmount: withheld, whtRate: whtEnabled && rate !== 'other' ? Number(rate) : null,
        whtCertificateNo: whtEnabled ? certificate.trim() || undefined : undefined,
      });
      onRecorded(result.receipt?.id, printWindow ?? undefined);
    } catch (err) {
      printWindow?.close();
      setError(err instanceof ApiError ? err.message : 'บันทึกรับชำระไม่สำเร็จ ลองใหม่อีกครั้ง');
    } finally { setSubmitting(false); }
  };

  return <SideDrawer open title="บันทึกรับชำระ" onClose={onCancel}>
    <form onSubmit={handleSubmit} className="-m-4 space-y-6 px-6 py-5 [&_input]:min-h-11 [&_select]:min-h-11">
      <div className="space-y-2 border-b pb-4"><div className="flex flex-wrap gap-2 text-xs"><span className="rounded bg-muted px-2 py-1">{invoiceNumber}</span><span className="rounded bg-muted px-2 py-1">ขั้นตอนที่ 3: รับชำระ</span></div><h3 className="text-xl font-semibold">{invoiceNumber}</h3><p>{customerName || 'ไม่ระบุผู้ว่าจ้าง'} {clientType && <span className="whitespace-nowrap rounded border px-2 py-1 text-xs">{clientType === 'COMPANY' ? 'นิติบุคคล' : 'บุคคลธรรมดา'}</span>} · ยอดค้างชำระ {formatCurrency(outstanding)}</p></div>
      <fieldset className="space-y-2"><legend className="font-medium">ช่องทางการรับเงิน</legend><p className="text-xs text-muted-foreground">เลือกวิธีที่ได้รับเงินจริง</p><div className="flex flex-wrap gap-2">{([['TRANSFER', 'โอนเงิน'], ['PROMPTPAY', 'พร้อมเพย์'], ['CHEQUE', 'เช็ค'], ['CASH', 'เงินสด']] as const).map(([value, label]) => <button type="button" key={value} title={`กดเพื่อเลือก${label}`} aria-pressed={method === value} onClick={() => setMethod(value)} className={`min-h-11 whitespace-nowrap rounded-md border px-4 ${method === value ? 'bg-primary text-primary-foreground' : 'bg-card'}`}>{label}</button>)}</div></fieldset>
      <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-1.5"><label className="text-sm font-medium">วันที่รับเงิน</label><ThaiDateInput label="วันที่รับเงิน" value={receivedAt} onChange={setReceivedAt} /><p className="text-xs text-muted-foreground">ใช้เป็นวันที่บนใบเสร็จ</p></div><label className="space-y-1.5 text-sm"><span className="block font-medium">ยอดที่ได้รับจริง</span><MoneyInput value={amount} min={0.01} max={outstanding} onValueChange={setAmount} /><span className="block text-xs text-muted-foreground">ระบุยอดเงินที่ได้รับก่อนรวมภาษีหัก ณ ที่จ่าย</span></label></div>
      <section className="space-y-4 rounded-lg border border-[#E9D7B8] bg-[#FAF5EB] p-4"><label className="flex items-center gap-2 font-medium"><input type="checkbox" checked={whtEnabled} onChange={e => setWhtEnabled(e.target.checked)} /> ผู้ว่าจ้างหัก ณ ที่จ่าย</label><p className="text-xs text-muted-foreground">ผู้ว่าจ้างบุคคลธรรมดาไม่ต้องหัก</p>{whtEnabled && <><div role="group" aria-label="อัตราหัก ณ ที่จ่าย" className="flex flex-wrap gap-2">{([['0.03', '3%'], ['0.01', '1% e-Withholding'], ['other', 'อื่น ๆ']] as const).map(([value, label]) => <button key={value} type="button" title={`กดเพื่อเลือก ${label}`} aria-pressed={rate === value} onClick={() => setRate(value)} className={`min-h-11 whitespace-nowrap rounded-md border px-3 ${rate === value ? 'border-primary font-bold' : ''}`}>{label}</button>)}</div><p className="text-xs text-muted-foreground">{feeBase === null ? 'โหลดฐานภาษีไม่ได้ โปรดระบุยอดตามหนังสือรับรอง' : `ฐานภาษีค่าบริการก่อน VAT ${formatCurrency(feeBase)} ไม่รวมเงินจ่ายแทน ตรวจสอบยอดตามหนังสือรับรอง`}</p><label className="block space-y-1.5 text-sm">ยอดหัก ณ ที่จ่าย<MoneyInput value={wht} min={0} onValueChange={setWht} /></label><label className="block space-y-1.5 text-sm">เลขที่หนังสือรับรอง (50 ทวิ)<input value={certificate} onChange={e => setCertificate(e.target.value)} maxLength={120} className="min-h-11 w-full rounded-md border bg-background px-3" /><span className="block text-xs text-muted-foreground">ใช้ตรวจสอบหนังสือรับรอง</span></label></>}</section>
      <label className="block text-sm font-medium">เทมเพลตใบเสร็จ<select title="เลือกหน้าตาใบเสร็จ" value={templateId} onChange={e => setTemplateId(e.target.value)} className="mt-1 min-h-11 w-full rounded-md border bg-background px-3"><option value="">ใช้เทมเพลตที่กำหนดไว้</option>{templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select><span className="mt-1 block text-xs text-muted-foreground">เลือกหน้าตาที่ใช้กับใบเสร็จนี้</span></label>
      {templateError && <p role="alert" className="text-sm text-destructive">{templateError}</p>}
      <section className="space-y-2 rounded-lg border p-4 sm:p-5" aria-label="สรุปยอด">{[['ยอดค้างก่อนบันทึก', outstanding], ['รับเงิน', Number(amount) || 0], ['หัก ณ ที่จ่าย', withheld], ['ยอดค้างหลังบันทึก', method === 'CHEQUE' ? outstanding : Math.max(0, outstanding - (Number(amount) || 0) - withheld)]].map(([label, value]) => <p key={label} className="flex justify-between gap-4"><span>{label}</span><strong>{formatCurrency(Number(value))}</strong></p>)}</section>
      <p className="text-sm text-muted-foreground">{method === 'CHEQUE' ? 'ยังไม่ออกใบเสร็จจนกว่าเช็คผ่าน' : `ระบบจะออกใบเสร็จเลขที่ถัดไป ลงวันที่ ${receivedAt ? new Date(`${receivedAt}T12:00:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' }) : 'ที่ระบุ'} ทันทีที่บันทึก`}</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="sticky bottom-0 flex flex-wrap gap-3 border-t bg-card px-6 py-4"><Button type="submit" disabled={submitting || templatesLoading || !!templateError} className="min-h-11 w-full whitespace-nowrap">{submitting ? 'กำลังบันทึก…' : method === 'CHEQUE' ? 'บันทึกเช็ค' : 'บันทึกและออกใบเสร็จ'}</Button>{allowPrint && <Button type="submit" value="print" variant="outline" disabled={submitting || templatesLoading || !!templateError || method === 'CHEQUE'} className="min-h-11 whitespace-nowrap">บันทึกแล้วพิมพ์ทันที</Button>}<Button type="button" variant="outline" onClick={onCancel} disabled={submitting} className="min-h-11 whitespace-nowrap">ยกเลิก</Button><p className="text-xs text-muted-foreground">กดเพื่อบันทึกยอดหรือยกเลิก</p></div>
    </form>
  </SideDrawer>;
}
