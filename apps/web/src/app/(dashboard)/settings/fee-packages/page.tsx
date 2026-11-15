'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowUp, Calculator, Plus, Trash2 } from 'lucide-react';
import { CASE_STAGE_ORDER, computeFeePackage, hasFirmCapability, splitMilestones, validateFeePackage, type FeeComponent, type FeeInputs, type FeeMilestone } from '@lawfirm/shared';
import { api, request, type CaseTypeItem } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { caseStageLabel } from '@/lib/stage-labels';
import { formatCurrency } from '@/lib/utils';
import { PageHeader } from '@/components/samnuan/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/ui/MoneyInput';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { EmptyState } from '@/components/ui/misc';
import { SideDrawer } from '@/components/ui/SideDrawer';
import type { TaxClass } from '@/lib/invoice-composer';

type Package = { id?: string; caseTypeId: string; name: string; sortOrder: number; components: FeeComponent[]; milestones: FeeMilestone[]; feeTaxClass: TaxClass };
const types: Record<FeeComponent['type'], string> = { FIXED: 'ราคาคงที่', PERCENT_CLAIM: '% ของทุนทรัพย์', TIERED_CLAIM: 'ตามช่วงทุนทรัพย์', PERCENT_RECOVERY: '% ของยอดที่ได้รับ', PER_UNIT: 'ต่อหน่วย', HOURLY: 'รายชั่วโมง' };
const taxLabels: Record<TaxClass, string> = { LITIGATION_EXEMPT: 'ว่าความ (ยกเว้น VAT)', ADVISORY_VAT: 'ที่ปรึกษา (VAT 7%)', DISBURSEMENT: 'จ่ายแทน (ไม่คิด VAT)' };
const field = 'min-h-11 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm';
const card = 'min-w-0 rounded-xl border bg-card p-4 sm:p-5';
const heading = 'mb-4 border-b pb-3 font-semibold';

export default function FeePackagesPage() {
  const { token, user } = useAuth();
  const canRead = hasFirmCapability(user?.firmRole, 'manageInvoices');
  const canEdit = hasFirmCapability(user?.firmRole, 'manageSubscription');
  const [caseTypes, setCaseTypes] = useState<CaseTypeItem[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [selectedType, setSelectedType] = useState('');
  const [draft, setDraft] = useState<Package | null>(null);
  const [original, setOriginal] = useState('');
  const [inputs, setInputs] = useState<FeeInputs>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const dirty = !!draft && JSON.stringify(draft) !== original;
  const load = useCallback(async () => {
    if (!token || !canRead) return;
    setLoading(true); setLoadError('');
    try {
      const [categories, tiers] = await Promise.all([api.getCaseTypes(token, false), request<Package[]>('/fee-packages', { token })]);
      setCaseTypes(categories); setPackages(tiers); setSelectedType(current => categories.some(c => c.id === current) ? current : categories[0]?.id ?? '');
    } catch { setLoadError('โหลดตารางค่าธรรมเนียมไม่สำเร็จ ตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง'); }
    finally { setLoading(false); }
  }, [token, canRead]);
  useEffect(() => { void load(); }, [load]);
  const choose = (item: Package | null) => { setDraft(item ? structuredClone(item) : null); setOriginal(item ? JSON.stringify(item) : ''); setInputs({}); setErrors([]); };
  const mayLeave = () => !dirty || window.confirm('มีข้อมูลที่ยังไม่ได้บันทึก ต้องการละทิ้งการแก้ไขหรือไม่');
  const tiers = packages.filter(p => p.caseTypeId === selectedType).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  const patch = (change: Partial<Package>) => setDraft(current => current ? { ...current, ...change } : null);
  const changeComponent = (index: number, component: FeeComponent) => draft && patch({ components: draft.components.map((c, i) => i === index ? component : c) });
  const save = async () => {
    if (!draft || !token || busy) return;
    const validation = validateFeePackage(draft);
    if (!draft.name.trim()) validation.unshift('ระบุชื่อระดับค่าธรรมเนียม');
    if (draft.name.trim().length > 200) validation.unshift('ชื่อระดับต้องไม่เกิน 200 ตัวอักษร');
    if (validation.length) { setErrors(validation); return; }
    setBusy(true); setErrors([]);
    try {
      const { id, ...body } = draft;
      const saved = await request<Package>(id ? `/fee-packages/${id}` : '/fee-packages', { token, method: id ? 'PATCH' : 'POST', body: JSON.stringify({ caseTypeId: body.caseTypeId, name: body.name.trim(), sortOrder: body.sortOrder, components: body.components, milestones: body.milestones, feeTaxClass: body.feeTaxClass }) });
      setPackages(current => [...current.filter(p => p.id !== saved.id), saved]); choose(saved);
    } catch (e) { setErrors([`${e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ'} ตรวจสอบข้อมูลแล้วลองอีกครั้ง`]); }
    finally { setBusy(false); }
  };
  const archive = async () => {
    if (!draft?.id || !token || busy || !window.confirm(`เก็บระดับ “${draft.name}” ถาวร?`)) return;
    setBusy(true); setErrors([]);
    try { await request(`/fee-packages/${draft.id}/archive`, { token, method: 'POST' }); setPackages(current => current.filter(p => p.id !== draft.id)); choose(null); }
    catch (e) { setErrors([`${e instanceof Error ? e.message : 'เก็บถาวรไม่สำเร็จ'} ลองอีกครั้ง`]); }
    finally { setBusy(false); }
  };
  let preview: ReturnType<typeof computeFeePackage> | null = null;
  let previewError = '';
  if (draft) { try { preview = computeFeePackage(draft.components, inputs); } catch (e) { previewError = e instanceof Error ? e.message : 'ตรวจสอบส่วนประกอบและข้อมูลคำนวณ'; } }
  const totalPercent = draft?.milestones.reduce((sum, m) => sum + m.percent, 0) ?? 0;
  const amounts = preview && draft && Math.abs(totalPercent - 100) < 0.000001 ? splitMilestones(preview.total, draft.milestones) : [];
  const missing = preview?.requiredInputs.some(key => key.startsWith('unit:') ? inputs.units?.[key.slice(5)] === undefined : inputs[key as 'claimAmount' | 'recoveryAmount'] === undefined);
  if (user && !canRead) return <div><PageHeader title="ตารางราคากลางค่าวิชาชีพ" /><EmptyState title="ไม่มีสิทธิ์ดูตารางค่าธรรมเนียม" description="ติดต่อเจ้าของสำนักงานเพื่อขอสิทธิ์จัดการใบแจ้งหนี้" /></div>;
  return <div className="mx-auto max-w-[1600px] space-y-6">
    <PageHeader title="ตารางราคากลางค่าวิชาชีพ" description="กำหนดค่าบริการและงวดชำระตามประเภทคดี เพื่อใช้เป็นราคาอ้างอิงของสำนักงาน" />
    {!canEdit && <p className="rounded-lg border bg-muted p-4 text-sm">ดูข้อมูลได้อย่างเดียว เจ้าของสำนักงานเป็นผู้แก้ไขตารางค่าธรรมเนียม</p>}
    {loading && !loadError && <p role="status">กำลังโหลดตารางค่าธรรมเนียม…</p>}
    {loadError && <LoadFailed message={loadError} onRetry={() => void load()} />}
    {!loading && !loadError && <div className="grid items-start gap-6 lg:grid-cols-[minmax(200px,0.8fr)_minmax(0,1.5fr)] xl:grid-cols-[minmax(220px,0.8fr)_minmax(0,1.5fr)_minmax(260px,1fr)]">
      <aside className={`${card} space-y-3`}><h2 className={heading}>ประเภทคดี <Badge variant="muted" className="ml-2 whitespace-nowrap">{caseTypes.length} ประเภท</Badge></h2>
        {caseTypes.map(c => <button key={c.id} type="button" title={`แสดงแพ็กเกจ ${c.name}`} onClick={() => { if (mayLeave()) { setSelectedType(c.id); choose(null); } }} className={`flex min-h-11 w-full flex-wrap items-center justify-between gap-2 rounded-lg border p-4 text-left ${selectedType === c.id ? 'border-primary bg-primary/5' : 'border-transparent hover:bg-muted'}`}><span className="min-w-0 font-medium">{c.name}</span><Badge variant="muted" className="whitespace-nowrap">{packages.filter(p => p.caseTypeId === c.id).length} แพ็กเกจ</Badge></button>)}
        {!caseTypes.length && <p className="text-sm text-muted-foreground">ยังไม่มีประเภทคดี เพิ่มประเภทคดีก่อนตั้งราคา</p>}
        <Link href="/admin/case-types" title="จัดการประเภทคดีของสำนักงาน" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary"><Plus size={16} /> เพิ่มประเภทคดี</Link>
      </aside>
      <main className="min-w-0 space-y-6">
        <section className={card}><div className="flex flex-wrap gap-2" role="tablist" aria-label="ระดับค่าธรรมเนียม">{tiers.map(p => <Button key={p.id} role="tab" aria-selected={draft?.id === p.id} title={`แก้ไขระดับ ${p.name}`} variant={draft?.id === p.id ? 'default' : 'outline'} onClick={() => { if (mayLeave()) choose(p); }}>{p.name}</Button>)}{draft && !draft.id && <Badge className="whitespace-nowrap">{draft.name || 'ระดับใหม่'} · แบบร่าง</Badge>}{canEdit && selectedType && <Button variant="outline" title="เพิ่มระดับค่าธรรมเนียม" onClick={() => { if (mayLeave()) { setNewName(''); setAdding(true); } }}><Plus size={16} />เพิ่มระดับ</Button>}</div>
          {!draft && <p className="mt-4 text-sm text-muted-foreground">เลือกระดับเพื่อดูรายละเอียด{canEdit ? ' หรือเพิ่มระดับใหม่' : ''}</p>}
          {draft && <label className="mt-4 block text-sm font-medium">ชื่อระดับ<Input title="ระบุชื่อระดับ เช่น ปานกลาง" disabled={!canEdit} maxLength={200} value={draft.name} onChange={e => patch({ name: e.target.value })} /><span className="text-xs text-muted-foreground">ใช้แยกระดับราคาของประเภทคดีนี้</span></label>}
        </section>
        {draft && <><section className={`${card} space-y-3`}><h2 className={heading}>ส่วนประกอบราคา <Badge variant="muted" className="ml-2 whitespace-nowrap">{draft.components.length} รายการ</Badge></h2>
          {draft.components.map((c, index) => <div key={index} className="space-y-3 rounded-lg border p-4"><div className="flex flex-wrap items-center justify-between gap-2"><Badge className="whitespace-nowrap">{types[c.type]}</Badge>{canEdit && <div className="flex flex-wrap gap-2"><Button size="icon" variant="ghost" title="เลื่อนส่วนประกอบขึ้น" aria-label={`เลื่อน ${types[c.type]} ขึ้น`} disabled={index === 0} onClick={() => { const next = [...draft.components]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; patch({ components: next }); }}><ArrowUp size={16} /></Button><Button size="icon" variant="ghost" title="เลื่อนส่วนประกอบลง" aria-label={`เลื่อน ${types[c.type]} ลง`} disabled={index === draft.components.length - 1} onClick={() => { const next = [...draft.components]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; patch({ components: next }); }}><ArrowDown size={16} /></Button><Button size="icon" variant="ghost" title="ลบส่วนประกอบ" aria-label={`ลบ ${types[c.type]}`} onClick={() => patch({ components: draft.components.filter((_, i) => i !== index) })}><Trash2 size={16} /></Button></div>}</div>
          <div className="grid gap-3 sm:grid-cols-2">
            {c.type === 'FIXED' && <label className="text-sm">ชื่อรายการ (ไม่บังคับ)<Input title="ระบุชื่อรายการราคาคงที่" disabled={!canEdit} value={c.label ?? ''} onChange={e => changeComponent(index, { ...c, label: e.target.value || undefined })} /></label>}
            {(c.type === 'FIXED' || c.type === 'PER_UNIT') && <label className="text-sm">จำนวนเงิน (บาท)<MoneyInput title="ระบุจำนวนเงินต่อรายการ" disabled={!canEdit} value={Number.isNaN(c.amount) ? '' : c.amount} onValueChange={v => changeComponent(index, { ...c, amount: v === '' ? NaN : Number(v) })} /></label>}
            {(c.type === 'PERCENT_CLAIM' || c.type === 'PERCENT_RECOVERY') && <><label className="text-sm">อัตรา (%)<Input title="ระบุอัตราตั้งแต่ 0 ถึง 100" disabled={!canEdit} type="number" min="0" max="100" value={Number.isNaN(c.rate) ? '' : c.rate} onChange={e => changeComponent(index, { ...c, rate: e.target.value === '' ? NaN : Number(e.target.value) })} /></label><label className="text-sm">ขั้นต่ำ (บาท ไม่บังคับ)<MoneyInput title="เว้นว่างหากไม่มีขั้นต่ำ" disabled={!canEdit} value={c.min ?? ''} onValueChange={v => changeComponent(index, { ...c, min: v === '' ? undefined : Number(v) })} /></label>{c.type === 'PERCENT_CLAIM' && <label className="text-sm">สูงสุด (บาท ไม่บังคับ)<MoneyInput title="เว้นว่างหากไม่มีเพดาน" disabled={!canEdit} value={c.max ?? ''} onValueChange={v => changeComponent(index, { ...c, max: v === '' ? undefined : Number(v) })} /></label>}</>}
            {c.type === 'PER_UNIT' && <><label className="text-sm">รหัสหน่วย<Input title="ระบุรหัสหน่วย เช่น hearing" disabled={!canEdit} value={c.unitKey} onChange={e => changeComponent(index, { ...c, unitKey: e.target.value })} /></label><label className="text-sm">ชื่อหน่วย<Input title="ระบุชื่อหน่วย เช่น นัดสืบพยาน" disabled={!canEdit} value={c.unitLabel} onChange={e => changeComponent(index, { ...c, unitLabel: e.target.value })} /></label></>}
          </div>
          {c.type === 'TIERED_CLAIM' && <div className="space-y-3">{c.brackets.map((b, j) => <div key={j} className="flex flex-wrap items-end gap-2"><label className="min-w-0 flex-1 basis-32 text-sm">{b.upTo === null ? 'ช่วงสุดท้าย' : 'ถึงทุนทรัพย์ (บาท)'}<MoneyInput title="ระบุเพดานช่วงทุนทรัพย์" disabled={!canEdit || b.upTo === null} value={b.upTo ?? ''} placeholder="ไม่จำกัด" onValueChange={v => changeComponent(index, { ...c, brackets: c.brackets.map((row, k) => k === j ? { ...row, upTo: v === '' ? 0 : Number(v) } : row) })} /></label><label className="min-w-0 flex-1 basis-24 text-sm">อัตรา (%)<Input title="ระบุอัตราของช่วงนี้" disabled={!canEdit} type="number" min="0" max="100" value={Number.isNaN(b.rate) ? '' : b.rate} onChange={e => changeComponent(index, { ...c, brackets: c.brackets.map((row, k) => k === j ? { ...row, rate: e.target.value === '' ? NaN : Number(e.target.value) } : row) })} /></label>{canEdit && c.brackets.length > 1 && <Button variant="ghost" size="icon" title="ลบช่วงทุนทรัพย์" aria-label="ลบช่วงทุนทรัพย์" onClick={() => changeComponent(index, { ...c, brackets: c.brackets.filter((_, k) => k !== j).map((row, k, all) => k === all.length - 1 ? { ...row, upTo: null } : row) })}><Trash2 size={16} /></Button>}</div>)}{canEdit && <Button variant="outline" title="เพิ่มช่วงก่อนช่วงสุดท้าย" onClick={() => changeComponent(index, { ...c, brackets: [...c.brackets.slice(0, -1), { upTo: (c.brackets.at(-2)?.upTo ?? 0) + 100000, rate: 0 }, c.brackets[c.brackets.length - 1]] })}><Plus size={16} />เพิ่มช่วง</Button>}<p className="text-xs text-muted-foreground">คำนวณแต่ละช่วงแยกกัน ช่วงสุดท้ายไม่จำกัด</p></div>}
          {c.type === 'PERCENT_RECOVERY' && <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">ข้อตกลงส่วนแบ่งตามผลคดีอาจเป็นโมฆะ (ฎ.3331/2556) ให้ทนายตรวจสัญญาก่อนใช้</p>}{c.type === 'HOURLY' && <p className="text-sm text-muted-foreground">เรียกเก็บตามบันทึกเวลา รายการนี้ไม่รวมในราคาประมาณการแพ็กเกจ</p>}</div>)}
          {canEdit && <label className="block text-sm">เพิ่มส่วนประกอบ<select title="เลือกประเภทส่วนประกอบที่ต้องการเพิ่ม" className={field} value="" onChange={e => { const type = e.target.value as FeeComponent['type']; const component: FeeComponent = type === 'FIXED' ? { type, amount: 0 } : type === 'PERCENT_CLAIM' || type === 'PERCENT_RECOVERY' ? { type, rate: 0 } : type === 'TIERED_CLAIM' ? { type, brackets: [{ upTo: null, rate: 0 }] } : type === 'PER_UNIT' ? { type, amount: 0, unitKey: '', unitLabel: '' } : { type: 'HOURLY' }; patch({ components: [...draft.components, component] }); }}><option value="">+ เลือกประเภทส่วนประกอบ</option>{Object.entries(types).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
        </section>
        <section className={card}><h2 className={heading}>ประเภทภาษี</h2><label className="block text-sm">ประเภทภาษีค่าวิชาชีพ<select title="เลือกการคิดภาษีสำหรับค่าธรรมเนียม" disabled={!canEdit} className={field} value={draft.feeTaxClass} onChange={e => patch({ feeTaxClass: e.target.value as TaxClass })}>{Object.entries(taxLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label></section>
        <section className={`${card} space-y-3`}><h2 className={heading}>งวดชำระตามขั้นตอนคดี</h2>{draft.milestones.map((m, index) => <div key={m.id} className="space-y-3 rounded-lg border p-4"><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">ชื่องวด<Input title="ระบุชื่องวดชำระ" disabled={!canEdit} value={m.label} onChange={e => patch({ milestones: draft.milestones.map((row, i) => i === index ? { ...row, label: e.target.value } : row) })} /></label><label className="text-sm">ขั้นตอนคดี<select title="เลือกขั้นตอนที่ถึงงวด" disabled={!canEdit} className={field} value={m.stage} onChange={e => patch({ milestones: draft.milestones.map((row, i) => i === index ? { ...row, stage: e.target.value as FeeMilestone['stage'] } : row) })}>{CASE_STAGE_ORDER.map(stage => <option key={stage} value={stage}>{caseStageLabel(stage)}</option>)}</select></label><label className="text-sm">สัดส่วน (%)<Input title="ระบุสัดส่วนงวดตั้งแต่ 0 ถึง 100" disabled={!canEdit} type="number" min="0" max="100" value={Number.isNaN(m.percent) ? '' : m.percent} onChange={e => patch({ milestones: draft.milestones.map((row, i) => i === index ? { ...row, percent: e.target.value === '' ? NaN : Number(e.target.value) } : row) })} /></label></div>{canEdit && <div className="flex flex-wrap gap-2"><Button variant="outline" size="icon" title="เลื่อนงวดขึ้น" aria-label={`เลื่อนงวด ${m.label} ขึ้น`} disabled={index === 0} onClick={() => { const next = [...draft.milestones]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; patch({ milestones: next }); }}><ArrowUp size={16} /></Button><Button variant="outline" size="icon" title="เลื่อนงวดลง" aria-label={`เลื่อนงวด ${m.label} ลง`} disabled={index === draft.milestones.length - 1} onClick={() => { const next = [...draft.milestones]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; patch({ milestones: next }); }}><ArrowDown size={16} /></Button><Button variant="outline" size="icon" title="ลบงวด" aria-label={`ลบงวด ${m.label}`} onClick={() => patch({ milestones: draft.milestones.filter((_, i) => i !== index) })}><Trash2 size={16} /></Button></div>}</div>)}
          {canEdit && <Button variant="outline" title="เพิ่มงวดชำระ สูงสุด 12 งวด" disabled={draft.milestones.length >= 12} onClick={() => patch({ milestones: [...draft.milestones, { id: crypto.randomUUID(), label: '', stage: CASE_STAGE_ORDER[0], percent: 0 }] })}><Plus size={16} />เพิ่มงวด</Button>}
          <div><div className="flex justify-between text-sm"><span>สัดส่วนรวม {draft.milestones.length ? '(ต้องรวม 100%)' : '(ไม่กำหนดงวดได้)'}</span><span>{Number.isFinite(totalPercent) ? totalPercent : 0}%</span></div><div className="mt-2 h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, totalPercent || 0))}%` }} /></div></div>
        </section></>}
      </main>
      {draft && <aside className={`${card} space-y-6 xl:sticky xl:top-6`}><div><h2 className={heading}><Calculator className="mr-2 inline" size={18} />ทดลองคำนวณ</h2><p className="text-sm text-muted-foreground">จำลองผลตามส่วนประกอบของระดับนี้</p></div>
        {preview?.requiredInputs.map(key => { const unit = key.startsWith('unit:') ? key.slice(5) : null; const unitComponent = draft.components.find(c => c.type === 'PER_UNIT' && c.unitKey === unit); const label = key === 'claimAmount' ? 'ทุนทรัพย์ในคดี (บาท)' : key === 'recoveryAmount' ? 'ยอดที่ได้รับ (บาท)' : `จำนวน ${unitComponent?.type === 'PER_UNIT' ? unitComponent.unitLabel : unit}`; return <label key={key} className="block text-sm font-medium">{label}<MoneyInput title={`กรอก${label}เพื่อทดลองคำนวณ`} value={unit ? inputs.units?.[unit] ?? '' : inputs[key as 'claimAmount' | 'recoveryAmount'] ?? ''} onValueChange={v => setInputs(current => { if (!unit) return { ...current, [key]: v === '' ? undefined : Number(v) }; const units = { ...current.units }; if (v === '') delete units[unit]; else units[unit] = Number(v); return { ...current, units }; })} /><span className="text-xs text-muted-foreground">กรอกตัวเลขเพื่อดูผลประมาณการ</span></label>; })}
        {previewError && <p role="status" className="text-sm text-muted-foreground">{previewError} กรุณาตรวจสอบข้อมูลก่อนทดลองคำนวณ</p>}
        {preview && missing && <p className="text-sm text-muted-foreground">กรอกข้อมูลที่ใช้คำนวณให้ครบเพื่อดูยอดประมาณการ</p>}
        {preview && !missing && <div className="space-y-3"><div className="space-y-3 rounded-lg bg-muted p-4">{preview.parts.map((part, i) => <div key={i} className="flex flex-wrap justify-between gap-2 text-sm"><span>{part.label}</span><strong>{formatCurrency(part.amount)}</strong></div>)}</div><div className="rounded-lg bg-primary p-4 text-primary-foreground"><span className="text-sm">ประมาณการค่าวิชาชีพรวม</span><p className="text-2xl font-bold">{formatCurrency(preview.total)}</p></div>{draft.milestones.length > 0 && <div className="space-y-3"><h3 className="font-medium">ยอดแบ่งตามงวด</h3>{amounts.length ? draft.milestones.map((m, i) => <div key={m.id} className="flex flex-wrap justify-between gap-2 text-sm"><span>{m.label || 'งวดที่ยังไม่ระบุชื่อ'} · {m.percent}%</span><strong>{formatCurrency(amounts[i])}</strong></div>) : <p className="text-sm text-muted-foreground">ปรับสัดส่วนงวดให้รวม 100% เพื่อดูยอดแบ่ง</p>}</div>}</div>}
        {errors.length > 0 && <div role="alert" className="space-y-1 rounded-lg bg-destructive/10 p-4 text-sm text-destructive">{errors.map((error, i) => <p key={i}>{error}</p>)}</div>}
        {canEdit && <div className="flex flex-wrap gap-3 border-t pt-4"><Button title="ตรวจสอบและบันทึกระดับนี้" disabled={busy} onClick={() => void save()}>บันทึกแพ็กเกจ</Button>{draft.id && <Button variant="outline" title="เก็บระดับนี้ถาวร" disabled={busy} onClick={() => void archive()}>เก็บถาวร</Button>}</div>}
      </aside>}
    </div>}
    <SideDrawer open={adding} title="เพิ่มระดับค่าธรรมเนียม" onClose={() => setAdding(false)}><div className="space-y-6 px-2 py-1"><label className="block text-sm font-medium">ชื่อระดับ<Input title="ระบุชื่อระดับ เช่น ง่าย หรือ ปานกลาง" value={newName} maxLength={200} onChange={e => setNewName(e.target.value)} /><span className="text-xs text-muted-foreground">ตั้งชื่อที่ทีมใช้เรียกระดับนี้</span></label><div className="flex flex-wrap gap-3 border-t px-2 py-4"><Button title="สร้างแบบร่างระดับใหม่" disabled={!newName.trim()} onClick={() => { choose({ caseTypeId: selectedType, name: newName.trim(), sortOrder: Math.max(-1, ...tiers.map(p => p.sortOrder)) + 1, components: [{ type: 'FIXED', amount: 0 }], milestones: [], feeTaxClass: 'LITIGATION_EXEMPT' }); setOriginal(''); setAdding(false); }}>เพิ่มระดับ</Button><Button variant="outline" title="ปิดโดยไม่เพิ่มระดับ" onClick={() => setAdding(false)}>ยกเลิก</Button></div></div></SideDrawer>
  </div>;
}
