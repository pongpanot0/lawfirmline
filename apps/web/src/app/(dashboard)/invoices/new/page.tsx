'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2 } from 'lucide-react';
import { computeInvoiceTotals, hasFirmCapability } from '@lawfirm/shared';
import { request } from '@/lib/api';
import type { CaseFee } from '@/lib/case-fee';
import { caseStageLabel } from '@/lib/stage-labels';
import { api, type BillingProfile, type CaseDetail, type DocumentTemplate, type InvoiceDraft, type ResolvedDocumentTemplate } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatCurrency } from '@/lib/utils';
import { addWork, buildInvoiceLines, groupLines, reorder, type ComposerLine, type TaxClass } from '@/lib/invoice-composer';
import { buildBillingDocHtml, invoiceFirmData, openBillingDocWindow } from '@/lib/billing-doc';
import { PageHeader } from '@/components/samnuan/PageHeader';
import { Button } from '@/components/ui/button';
import { MoneyInput } from '@/components/ui/MoneyInput';
import { ThaiDateInput } from '@/components/ui/ThaiDateInput';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { NoAccess } from '@/components/ui/NoAccess';

const input = 'min-h-11 w-full rounded-lg border bg-background px-3 py-2 text-sm';
const hint = 'mt-1 block text-xs text-muted-foreground';
const taxLabels: Record<TaxClass, string> = { LITIGATION_EXEMPT: 'ว่าความ (ยกเว้น)', ADVISORY_VAT: 'ที่ปรึกษา (VAT 7%)', DISBURSEMENT: 'จ่ายแทน (ไม่คิด VAT)' };

export default function InvoiceComposer() {
  const { token, user } = useAuth(); const router = useRouter();
  const [caseId, setCaseId] = useState(''); const [matter, setMatter] = useState<CaseDetail | null>(null);
  const [draft, setDraft] = useState<InvoiceDraft | null>(null); const [profile, setProfile] = useState<BillingProfile | null>(null);
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]); const [resolved, setResolved] = useState<ResolvedDocumentTemplate | null>(null);
  const [templateId, setTemplateId] = useState(''); const [customerId, setCustomerId] = useState(''); const [dueAt, setDueAt] = useState('');
  const [lines, setLines] = useState<ComposerLine[]>([]); const [selected, setSelected] = useState<string[]>([]); const [tab, setTab] = useState<'milestone' | 'time' | 'expense'>('milestone');
  const [fee, setFee] = useState<CaseFee | null>(null);
  const [drag, setDrag] = useState<ComposerLine | null>(null); const [dragLine, setDragLine] = useState<string | null>(null);
  const [discount, setDiscount] = useState(''); const [reason, setReason] = useState(''); const [error, setError] = useState(''); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [revision, setRevision] = useState(0);
  useEffect(() => { setCaseId(new URLSearchParams(window.location.search).get('caseId') ?? ''); }, []);
  useEffect(() => {
    if (!token || !caseId) return;
    let active = true; setLoading(true); setError('');
    Promise.all([api.getCase(token, caseId), api.getInvoiceDraft(token, caseId), api.getBillingProfile(token), api.getBillingDocumentTemplates(token, 'INVOICE'), request<CaseFee | null>(`/cases/${caseId}/fee`, { token })]).then(([c, d, p, t, f]) => {
      if (!active) return; setFee(f); const preselect = new URLSearchParams(window.location.search).get('milestone'); const m = f?.milestones.find(x => x.id === preselect && !x.invoiceId && (x.status === 'PENDING' || x.status === 'PARTIAL')); if (m && f) setLines(rows => addWork(rows, [{ key: `milestone:${m.id}`, id: m.id, source: 'milestone', description: m.label, amount: m.closeAmount ?? m.amount, taxClass: f.feeTaxClass }])); setMatter(c); setDraft(d); setProfile(p); setTemplates(t); setCustomerId(c.customers?.find(x => x.isPrimary)?.customerId ?? c.customers?.[0]?.customerId ?? '');
    }).catch(() => { if (active) setError('โหลดข้อมูลคดีและงานค้างเรียกเก็บไม่สำเร็จ ลองใหม่อีกครั้ง'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, caseId, revision]);
  useEffect(() => {
    if (!token || !matter) return; let active = true; setResolved(null);
    api.resolveDocumentTemplate(token, 'INVOICE', customerId || undefined).then(t => { if (active) { setResolved(t); setTemplateId(t.templateId ?? ''); } }).catch(() => { if (active) setError('โหลดเทมเพลตไม่สำเร็จ ลองใหม่อีกครั้ง'); });
    return () => { active = false; };
  }, [token, matter, customerId]);
  const work: ComposerLine[] = [...(fee?.milestones ?? []).filter(m => !m.invoiceId && (m.status === 'PENDING' || m.status === 'PARTIAL')).sort((a, b) => Number(b.reached) - Number(a.reached) || a.sortOrder - b.sortOrder).map(m => ({ key: `milestone:${m.id}`, id: m.id, source: 'milestone' as const, description: m.label, amount: m.closeAmount ?? m.amount, taxClass: fee!.feeTaxClass })), ...(draft?.timeEntries ?? []).map(e => ({ key: `time:${e.id}`, id: e.id, source: 'time' as const, description: e.description || 'ค่าทนายความ', amount: e.amount, taxClass: 'LITIGATION_EXEMPT' as const })), ...(draft?.expenses ?? []).map(e => ({ key: `expense:${e.id}`, id: e.id, source: 'expense' as const, description: e.description, amount: e.amount, taxClass: 'DISBURSEMENT' as const }))];
  const available = work.filter(w => !lines.some(l => l.key === w.key)); const visible = available.filter(w => w.source === tab); const grouped = groupLines(lines);
  const discountAmount = Number(discount) || 0; const totals = computeInvoiceTotals(lines, discountAmount, profile?.vatRegistered ?? false, 0.07);
  const validLines = lines.length > 0 && lines.every(l => l.description.trim() && Number.isFinite(l.amount) && l.amount >= 0);
  const validDiscount = discountAmount >= 0 && discountAmount <= totals.exempt + totals.taxable && (!discountAmount || !!reason.trim());
  const needsPayer = !!matter?.customers?.length; // no payer records → API bills the case's client
  const ready = (!needsPayer || !!customerId) && validLines && validDiscount && !!resolved;
  const patch = (key: string, data: Partial<ComposerLine>) => setLines(rows => rows.map(l => l.key === key ? { ...l, ...data } : l));
  const move = (key: string, direction: number) => setLines(rows => { const group = groupLines(rows); const ordered = [...group.fees, ...group.disbursements]; const from = ordered.findIndex(l => l.key === key); const to = from + direction; if (to < 0 || to >= ordered.length || (ordered[from].taxClass === 'DISBURSEMENT') !== (ordered[to].taxClass === 'DISBURSEMENT')) return rows; return reorder(ordered, from, to); });
  const add = (items: ComposerLine[]) => { setLines(rows => addWork(rows, items)); setSelected(ids => ids.filter(id => !items.some(item => item.key === id))); };
  const submit = async () => {
    if (!token || !ready || busy) return; setBusy(true); setError('');
    try { await api.createInvoice(token, caseId, { ...buildInvoiceLines(lines), billToCustomerId: customerId || undefined, templateId: templateId || undefined, dueAt: dueAt || undefined, discountAmount: discountAmount || undefined, discountReason: discountAmount ? reason.trim() : undefined }); router.push('/invoices'); }
    catch (e) { setError(e instanceof Error ? e.message : 'ออกใบแจ้งหนี้ไม่สำเร็จ ลองใหม่อีกครั้ง'); } finally { setBusy(false); }
  };
  const preview = async () => {
    if (!token || !matter || !resolved) return; const win = window.open('', '_blank'); if (!win) { setError('เปิดตัวอย่างไม่ได้ ให้อนุญาตป๊อปอัปแล้วลองใหม่'); return; }
    try { const template = await api.resolveDocumentTemplate(token, 'INVOICE', customerId || undefined, templateId || undefined); const firm = await invoiceFirmData(token, template.logoKey); const customer = customerId ? await api.getClient(token, customerId) : null;
      openBillingDocWindow(buildBillingDocHtml({ ...firm, kind: 'INVOICE', templateSnapshot: { layout: template.layout, logoKey: template.logoKey }, firmName: user?.firmName ?? '', invoiceNumber: 'ตัวอย่าง', issuedAt: new Date().toISOString(), dueAt: dueAt || null, matterLabel: `${matter.ownRef} — ${matter.title}`, billTo: customer ?? null, lines: [...grouped.fees, ...grouped.disbursements].map(l => ({ description: l.description, quantity: 1, unitPrice: l.amount, amount: l.amount, taxClass: l.taxClass })), totalAmount: totals.total, discountAmount, discountReason: reason }), win);
    } catch { win.close(); setError('สร้างตัวอย่างเอกสารไม่สำเร็จ ลองใหม่อีกครั้ง'); }
  };
  if (user && !hasFirmCapability(user.firmRole, 'manageInvoices')) return <NoAccess />;
  if (!caseId && typeof window !== 'undefined' && !new URLSearchParams(window.location.search).get('caseId')) return <div className="p-6">เลือกคดีก่อนออกใบแจ้งหนี้ <a href="/invoices" className="underline">กลับไปใบแจ้งหนี้</a></div>;
  if (loading || !matter || !profile) return <div className="p-6">{error ? <LoadFailed message={error} onRetry={() => setRevision(v => v + 1)} /> : 'กำลังโหลดข้อมูล…'}</div>;
  return <div className="mx-auto max-w-[1800px] space-y-6 px-4 pb-20 sm:px-6">
    <PageHeader title="ออกใบแจ้งหนี้" description={`${matter.ownRef} · ${matter.title}`} />
    <div className="grid gap-4 rounded-lg border bg-card p-4 sm:p-5 md:grid-cols-3">
      <label className="text-sm">ผู้ว่าจ้าง<select className={input} value={customerId} onChange={e => setCustomerId(e.target.value)}><option value="">{matter?.customers?.length ? 'เลือกผู้ว่าจ้าง' : 'ลูกความของคดี (ค่าเริ่มต้น)'}</option>{matter.customers?.map(c => <option key={c.customerId} value={c.customerId}>{c.customer.name}</option>)}</select><span className={hint}>เลือกผู้รับใบแจ้งหนี้จากคดี</span></label>
      <div className="text-sm"><ThaiDateInput label="วันครบกำหนด" value={dueAt} onChange={setDueAt} /><span className={hint}>กำหนดวันชำระเงิน</span></div>
      <label className="text-sm">เทมเพลต<select className={input} value={templateId} onChange={e => setTemplateId(e.target.value)}>{!resolved?.templateId && <option value="">{resolved?.name ?? 'กำลังโหลด…'}</option>}{templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select><span className={hint}>ใช้กับใบนี้ตอนพิมพ์และส่ง</span></label>
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <div className="grid items-start gap-4 xl:grid-cols-[380px_minmax(0,1fr)_300px]">
      <section className="rounded-lg border bg-card p-4 sm:p-5"><h2 className="mb-4 border-b pb-3 text-lg font-semibold">งานที่ยังไม่ได้เรียกเก็บ</h2><div role="tablist" aria-label="งานค้างเรียกเก็บ" className="flex flex-wrap gap-2">{(['milestone', 'time', 'expense'] as const).map(t => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`min-h-11 whitespace-nowrap border-b-2 px-2 text-sm ${tab === t ? 'border-primary font-semibold' : 'border-transparent'}`}>{t === 'milestone' ? 'งวดค่าวิชาชีพ' : t === 'time' ? 'ชั่วโมงทำงาน' : 'ค่าใช้จ่าย'} ({available.filter(w => w.source === t).length})</button>)}</div><button type="button" className="min-h-11 text-sm font-medium text-primary" title="เพิ่มรายการที่เลือกในแท็บนี้" onClick={() => add(visible.filter(w => selected.includes(w.key)))}>เพิ่มที่เลือกทั้งหมด →</button><p className={hint}>เลือกรายการแล้วกดเพิ่ม หรือลากไปยังรายการใบแจ้งหนี้</p><div className="mt-4 space-y-3">{visible.map(w => <div key={w.key} draggable onDragStart={e => { e.dataTransfer.setData('text/plain', w.key); e.dataTransfer.effectAllowed = 'copy'; setDrag(w); }} onDragEnd={() => setDrag(null)} className="flex items-start gap-2 rounded-lg border p-3"><GripVertical className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" /><input type="checkbox" aria-label={`เลือก ${w.description}`} checked={selected.includes(w.key)} onChange={e => setSelected(ids => e.target.checked ? [...ids, w.key] : ids.filter(id => id !== w.key))} className="mt-1 h-4 w-4" /><div className="min-w-0 flex-1 text-sm"><p>{w.description}</p><p className={hint}>{w.source === 'milestone' ? <><span className="inline-block whitespace-nowrap rounded bg-amber-100 px-2 py-1 text-amber-900">{fee?.milestones.find(m => m.id === w.id)?.reached ? 'ถึงขั้นตอนแล้ว' : 'ยังไม่ถึงขั้นตอน'}</span> · {caseStageLabel(fee!.milestones.find(m => m.id === w.id)!.stage)}</> : w.source === 'time' ? 'ชั่วโมงทำงาน' : 'ค่าใช้จ่าย'}</p></div><strong className="text-sm">{formatCurrency(w.amount)}</strong></div>)}{!visible.length && <p className="text-sm text-muted-foreground">ไม่มีรายการที่รอเพิ่ม</p>}</div></section>
      <main className="space-y-6" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (drag) add([drag]); setDrag(null); }}><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-semibold">รายการในใบแจ้งหนี้ <span className="text-sm text-muted-foreground">{lines.length} รายการ</span></h2><Button variant="outline" title="เพิ่มรายการที่ไม่มีในงานคดี" onClick={() => setLines(rows => [...rows, { key: crypto.randomUUID(), source: 'manual', description: '', amount: 0, taxClass: 'LITIGATION_EXEMPT' }])}><Plus className="h-4 w-4" />เพิ่มรายการเอง</Button></div>
      {drag && <div className="rounded-lg border-2 border-dashed border-primary p-5 text-center">วางที่นี่เพื่อเพิ่มรายการ</div>}
      {!lines.length && <div className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">เลือกหรือลากงานจากด้านซ้าย หรือเพิ่มรายการเอง</div>}
      {([['ค่าวิชาชีพ', grouped.fees], ['เงินจ่ายแทนลูกความ', grouped.disbursements]] as const).map(([title, rows]) => <section key={title} className="rounded-lg border bg-card p-4 sm:p-5"><h3 className="mb-4 flex justify-between border-b pb-3 font-semibold">{title}<span className="text-sm">{formatCurrency(rows.reduce((sum, row) => sum + row.amount, 0))}</span></h3><div className=""><div>{rows.map((line, index) => <div key={line.key} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); e.stopPropagation(); if (drag) add([drag]); else if (dragLine && dragLine !== line.key) setLines(current => { const g = groupLines(current); const ordered = [...g.fees, ...g.disbursements]; const from = ordered.findIndex(x => x.key === dragLine); const to = ordered.findIndex(x => x.key === line.key); return from >= 0 && to >= 0 && (ordered[from].taxClass === 'DISBURSEMENT') === (line.taxClass === 'DISBURSEMENT') ? reorder(ordered, from, to) : current; }); setDrag(null); setDragLine(null); }} className="flex flex-wrap items-start gap-2 border-b py-2"><div className="flex shrink-0 items-center"><span draggable onDragStart={e => { e.stopPropagation(); e.dataTransfer.setData('text/plain', line.key); e.dataTransfer.effectAllowed = 'move'; setDragLine(line.key); }} onDragEnd={() => setDragLine(null)} aria-label={`จัดลำดับ ${line.description}`} className="flex min-h-11 w-8 cursor-grab items-center justify-center"><GripVertical className="h-4 w-4 text-muted-foreground" /></span><button type="button" title="ย้ายขึ้น" aria-label={`ย้าย ${line.description} ขึ้น`} onClick={() => move(line.key, -1)} className="min-h-11 px-1"><ArrowUp className="h-4 w-4" /></button><button type="button" title="ย้ายลง" aria-label={`ย้าย ${line.description} ลง`} onClick={() => move(line.key, 1)} className="min-h-11 px-1"><ArrowDown className="h-4 w-4" /></button></div><span className="pt-3 text-xs text-muted-foreground">{index + 1}</span><textarea aria-label="รายละเอียดรายการ" rows={1} maxLength={500} value={line.description} onChange={e => patch(line.key, { description: e.target.value })} className={`${input} min-w-[12rem] flex-1 basis-[calc(100%-4rem)] resize-y overflow-hidden focus:min-h-[88px] focus:overflow-auto`} /><select aria-label="ประเภทภาษี" disabled={line.source === 'milestone'} title="ประเภทภาษีของรายการ" className={`${input} w-52 shrink-0 whitespace-nowrap`} value={line.taxClass} onChange={e => patch(line.key, { taxClass: e.target.value as TaxClass })}>{Object.entries(taxLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select><div className="w-36 shrink-0">{line.source === 'manual' ? <MoneyInput aria-label="จำนวนเงิน" value={String(line.amount)} onValueChange={v => patch(line.key, { amount: Number(v) || 0 })} className={input} /> : <div className={`${input} bg-muted text-right`}>{formatCurrency(line.amount)}</div>}</div><button type="button" title="ลบรายการ" aria-label={`ลบ ${line.description}`} onClick={() => setLines(current => current.filter(l => l.key !== line.key))} className="min-h-11 px-2"><Trash2 className="h-4 w-4" /></button></div>)}</div></div></section>)}
      </main>
      <aside className="space-y-4 rounded-lg border bg-card p-4 sm:p-5 xl:sticky xl:top-4"><h2 className="border-b pb-3 text-xl font-semibold">สรุปยอดใบแจ้งหนี้</h2>{[['ค่าวิชาชีพยกเว้น VAT', totals.exempt], ['มูลค่าที่คิดภาษี', totals.taxable], ...(profile.vatRegistered ? [['VAT 7%', totals.vat] as const] : []), ['เงินจ่ายแทนลูกความ', totals.disbursement]].map(([label, amount]) => <p key={label} className="flex justify-between gap-2 text-sm"><span>{label}</span><strong>{formatCurrency(amount as number)}</strong></p>)}<label className="block text-sm">ส่วนลด<MoneyInput aria-label="ส่วนลด" value={discount} onValueChange={setDiscount} className={input} /><span className={hint}>ไม่เกินยอดค่าวิชาชีพ</span></label>{discountAmount > 0 && <label className="block text-sm">เหตุผลส่วนลด<input className={input} maxLength={500} value={reason} onChange={e => setReason(e.target.value)} /><span className={hint}>ต้องระบุเหตุผลเมื่อให้ส่วนลด</span></label>}<p className="flex justify-between gap-2 border-t pt-4 text-lg font-semibold"><span>ยอดรวมทั้งสิ้น</span><span>{formatCurrency(totals.total)}</span></p><div className="space-y-2 border-t pt-4 text-sm"><p>ความพร้อมในการออกเอกสาร</p><p>{customerId || !needsPayer ? '✓' : '○'} {needsPayer ? 'เลือกผู้ว่าจ้าง' : 'ออกในนามลูกความของคดี'}</p><p>{validLines ? '✓' : '○'} มีรายการและรายละเอียดครบ</p><p>{validDiscount ? '✓' : '○'} ตรวจสอบส่วนลดและเหตุผล</p></div><Button className="w-full" disabled={!ready || busy} onClick={() => void submit()} title="ออกเลขที่และย้ายไปแท็บต้องส่ง">{busy ? 'กำลังออก…' : 'ออกใบแจ้งหนี้'}</Button><p className={hint}>ออกเลขที่และย้ายไปแท็บต้องส่ง</p><Button variant="outline" className="w-full" disabled={!resolved} onClick={() => void preview()} title="ดูข้อมูลที่ยังไม่บันทึกในเทมเพลตที่เลือก">ดูตัวอย่างเอกสาร</Button><p className={hint}>แสดงข้อมูลปัจจุบันโดยไม่บันทึก</p></aside>
    </div>
  </div>;
}
