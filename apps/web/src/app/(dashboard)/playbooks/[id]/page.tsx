'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { DocumentCategory, FIRM_ROLE_LABELS, hasFirmCapability } from '@lawfirm/shared';
import { ArrowLeft, CheckCircle2, ChevronDown, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useLocale } from '@/components/landing/LocaleProvider';
import { api, CaseTypeItem } from '@/lib/api';
import { CargoPlaybookRequirement, PlaybookRelease, PlaybookStep, setupRequest } from '@/lib/practice-setup';
import { documentCategoryLabel } from '@/lib/stage-labels';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SelectField, TextField } from '@/components/ui/form-fields';
import { Badge } from '@/components/ui/badge';
import { PageLoading } from '@/components/ui/misc';
import { LoadFailed } from '@/components/ui/LoadFailed';

import { QuickFlowCanvas } from './QuickFlowCanvas';

const CARGO_PLAYBOOK_KEY = 'CARGO_CLAIM_ASSESSMENT';
type PublishErrors = { name?: string; steps?: string; stepTitles?: Record<number, string>; cargo?: Record<number, string>; cargoSummary?: string };
type Success = { title: string; description: string; publishedId?: string };

export default function SopFlowEditor() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === 'new';
  const router = useRouter();
  const { token, user } = useAuth();
  const isAuthenticated = Boolean(token);
  const { locale } = useLocale();
  const th = locale === 'th';
  const settingsRef = useRef<HTMLDetailsElement>(null);
  const nameRef = useRef<HTMLDetailsElement>(null);
  const [source, setSource] = useState<PlaybookRelease | null>(null);
  const [caseTypes, setCaseTypes] = useState<CaseTypeItem[]>([]);
  const [name, setName] = useState('');
  const [caseTypeId, setCaseTypeId] = useState('');
  const [steps, setSteps] = useState<PlaybookStep[]>([]);
  const [requiredDocs, setRequiredDocs] = useState<string[]>([]);
  const [templateKey, setTemplateKey] = useState<string | null>(null);
  const [cargoRequirements, setCargoRequirements] = useState<CargoPlaybookRequirement[]>([]);
  const [creatingCaseType, setCreatingCaseType] = useState(false);
  const [newCaseTypeName, setNewCaseTypeName] = useState('');
  const [customDoc, setCustomDoc] = useState('');
  const [docSaving, setDocSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [publishError, setPublishError] = useState('');
  const [publishErrors, setPublishErrors] = useState<PublishErrors>({});
  const [caseTypeError, setCaseTypeError] = useState('');
  const [docsError, setDocsError] = useState('');
  const [customDocError, setCustomDocError] = useState('');
  const [success, setSuccess] = useState<Success | null>(null);
  const [reload, setReload] = useState(0);
  const [confirmPublish, setConfirmPublish] = useState(false);

  useEffect(() => {
    if (!token) return;
    let active = true;
    setLoading(true);
    setLoadError('');
    Promise.all([setupRequest<PlaybookRelease[]>(token, '/playbooks'), api.getCaseTypes(token, false)])
      .then(([releases, types]) => {
        if (!active) return;
        const found = isNew ? null : releases.find(p => p.id === id);
        setCaseTypes(types);
        if (!isNew && !found) { setLoadError(th ? 'ไม่พบชุดงานนี้' : 'SOP not found'); return; }
        setSource(found ?? null);
        setName(found?.name ?? '');
        setCaseTypeId(found?.caseTypeId ?? '');
        setSteps(structuredClone(found?.steps ?? []));
        setRequiredDocs(types.find(t => t.id === found?.caseTypeId)?.requiredDocuments ?? []);
        setTemplateKey(found?.templateKey ?? null);
        setCargoRequirements(structuredClone(found?.cargoTemplate?.requirements ?? []));
        setLoadError('');
        setPublishError('');
        setPublishErrors({});
        setCaseTypeError('');
        setDocsError('');
        setCustomDocError('');
      })
      .catch(e => { if (active) setLoadError(e instanceof Error ? e.message : 'โหลดข้อมูลไม่สำเร็จ ลองโหลดหน้าใหม่อีกครั้ง'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
    // Refreshing an access token must not reload the editor and discard its draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, user?.id, id, isNew, reload]);

  useEffect(() => {
    setPublishErrors({});
    setPublishError('');
  }, [name, caseTypeId, steps, cargoRequirements]);

  const handleCaseTypeLink = (value: string) => {
    if (value === '__new__') { setCreatingCaseType(true); setNewCaseTypeName(''); return; }
    setCreatingCaseType(false);
    setCaseTypeError('');
    setDocsError('');
    setCustomDocError('');
    setCaseTypeId(value);
    setRequiredDocs(caseTypes.find(t => t.id === value)?.requiredDocuments ?? []);
  };

  const createCaseType = async () => {
    if (!token) return;
    if (!newCaseTypeName.trim()) { setCaseTypeError(th ? 'กรอกชื่อประเภทคดีก่อน' : 'Enter a case type name.'); return; }
    setBusy(true); setCaseTypeError('');
    try {
      const created = await api.createCaseType(token, { name: newCaseTypeName.trim() }, true);
      setCaseTypes(list => [...list, created]);
      setCreatingCaseType(false);
      setCaseTypeId(created.id);
      setRequiredDocs([]);
      setSuccess({ title: th ? 'สร้างประเภทคดีแล้ว' : 'Case type created', description: created.name });
    } catch (e) { setCaseTypeError(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ ตรวจข้อมูลแล้วลองอีกครั้ง'); } finally { setBusy(false); }
  };

  const toggleDoc = (value: string) => setRequiredDocs(docs => docs.includes(value) ? docs.filter(v => v !== value) : [...docs, value]);
  const addCustomDoc = () => {
    const value = customDoc.trim();
    if (!value) { setCustomDocError('กรอกชื่อเอกสารก่อน'); return; }
    if (requiredDocs.includes(value)) { setCustomDocError('มีเอกสารนี้ในรายการแล้ว'); return; }
    setCustomDocError(''); setRequiredDocs([...requiredDocs, value]); setCustomDoc('');
  };

  const publish = async (confirmed = false) => {
    if (!token || busy) return;
    const invalidRoutine = steps.find(step => step.routine && (!step.instructions.trim() || !step.routine.expectedOutput.trim() || !step.routine.checks.some(check => check.trim())));
    if (invalidRoutine) { setPublishError(th ? `${invalidRoutine.title}: กรอกวิธีทำ ผลที่ต้องส่ง และรายการตรวจก่อนเผยแพร่` : `${invalidRoutine.title}: Add instructions, expected result and checks.`); return; }
    const stepTitles = Object.fromEntries(steps.map((step, index) => [index, !step.title.trim() ? (th ? 'กรอกชื่องานก่อน' : 'Enter a task name.') : '']).filter(([, message]) => message)) as Record<number, string>;
    const cargo = templateKey === CARGO_PLAYBOOK_KEY ? Object.fromEntries(cargoRequirements.map((item, index) => [index, !item.label.trim() ? (th ? 'กรอกชื่อเอกสารก่อน' : 'Enter a document name.') : '']).filter(([, message]) => message)) as Record<number, string> : {};
    const errors: PublishErrors = {
      name: !name.trim() ? (th ? 'กรอกชื่อชุดงานก่อน' : 'Enter an SOP name.') : undefined,
      steps: steps.length === 0 ? (th ? 'เพิ่มงานอย่างน้อย 1 ขั้นตอน' : 'Add at least one task.') : undefined,
      stepTitles,
      cargo,
      cargoSummary: templateKey === CARGO_PLAYBOOK_KEY && cargoRequirements.length === 0 ? (th ? 'เพิ่มรายการเอกสารสินค้าขนส่ง อย่างน้อย 1 รายการ' : 'Add at least one Cargo document.') : undefined,
    };
    setPublishErrors(errors);
    if (errors.name || errors.steps || Object.keys(stepTitles).length || Object.keys(cargo).length || errors.cargoSummary) {
      if (errors.name) nameRef.current?.setAttribute('open', '');
      if (Object.keys(cargo).length || errors.cargoSummary) settingsRef.current?.setAttribute('open', '');
      requestAnimationFrame(() => document.getElementById(errors.name ? 'sop-name' : Object.keys(stepTitles).length ? `sop-step-title-${Object.keys(stepTitles)[0]}` : errors.cargoSummary ? 'cargo-requirements' : `cargo-label-${Object.keys(cargo)[0]}`)?.focus());
      return;
    }
    if (!confirmed) { setConfirmPublish(true); return; }
    setBusy(true); setPublishError('');
    try {
      if (caseTypeId && JSON.stringify(requiredDocs) !== JSON.stringify(caseTypes.find(t => t.id === caseTypeId)?.requiredDocuments ?? [])) {
        await api.updateCaseType(token, caseTypeId, { requiredDocuments: requiredDocs }, true);
        setCaseTypes(list => list.map(t => t.id === caseTypeId ? { ...t, requiredDocuments: requiredDocs } : t));
      }
      const published = await setupRequest<PlaybookRelease>(token, '/playbooks', {
        name: name.trim(), caseTypeId: caseTypeId || undefined, steps: steps.map(step => ({ ...step, ...(step.routine ? { routine: { ...step.routine, checks: step.routine.checks.map(check => check.trim()).filter(Boolean) } } : {}) })),
        ...(templateKey === CARGO_PLAYBOOK_KEY ? { templateKey, cargoTemplate: { requirements: cargoRequirements } } : {}),
      }, true);
      setConfirmPublish(false);
      setSuccess({ title: 'เผยแพร่ชุดงานอัตโนมัติแล้ว', description: `${published.name} · ฉบับที่ ${published.version}`, publishedId: published.id });
    } catch (e) { setPublishError(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ ตรวจข้อมูลแล้วลองอีกครั้ง'); } finally { setBusy(false); }
  };

  const hasChanges = isNew || !source || name !== source.name || caseTypeId !== (source.caseTypeId ?? '') ||
    JSON.stringify(steps) !== JSON.stringify(source.steps) ||
    JSON.stringify(cargoRequirements) !== JSON.stringify(source.cargoTemplate?.requirements ?? []) ||
    JSON.stringify(requiredDocs) !== JSON.stringify(caseTypes.find(t => t.id === caseTypeId)?.requiredDocuments ?? []);
  const publishItems = [
    { label: 'ตั้งชื่อแล้ว', done: !!name.trim() },
    { label: `มี ${steps.length} ขั้นตอน`, done: steps.length > 0 && steps.every(step => !!step.title.trim()) },
    ...steps.flatMap((step, index) => !step.primaryRole ? [{ label: `ขั้นที่ ${index + 1} ยังไม่มีผู้ทำ — ระบบจะมอบให้ทนายผู้รับผิดชอบคดี`, done: false }] : []),
    ...((steps.some(step => step.routine && (!step.instructions.trim() || !step.routine.expectedOutput.trim() || !step.routine.checks.some(check => check.trim())))) ? [{ label: 'กรอกวิธีทำ ผลที่ต้องส่ง และรายการตรวจของงานประจำ', done: false }] : []),
    ...(templateKey === CARGO_PLAYBOOK_KEY && (cargoRequirements.length === 0 || cargoRequirements.some(item => !item.label.trim())) ? [{ label: 'กรอกรายการเอกสารสินค้าขนส่ง', done: false }] : []),
  ];

  const backTo = (href: string, label: string) => <Link href={href} className="inline-flex min-h-11 items-center gap-1 text-sm text-primary hover:underline"><ArrowLeft className="h-4 w-4" aria-hidden />{label}</Link>;
  if (loading) return <PageLoading variant="detail" title={th ? 'กำลังโหลดชุดงานอัตโนมัติ' : 'Loading SOP'} lines={2} />;
  if (user && !hasFirmCapability(user.firmRole, 'manageFirmContent') && source) return <div className="mx-auto max-w-6xl space-y-6 pb-24">
    <div className="flex flex-wrap items-center justify-between gap-2">{backTo('/sops?tab=playbooks', 'คู่มือการทำงาน / ชุดงานอัตโนมัติ')}<Badge variant="muted">อ่านอย่างเดียว · แก้ไขได้เฉพาะเจ้าของหรือผู้จัดการสำนักงาน</Badge></div>
    <section className="space-y-4 rounded-xl border-l-4 border-[var(--color-brass)] bg-[var(--operations-highlight)] p-6"><Badge variant="warning">ชุดงานอัตโนมัติ</Badge><h1 className="text-3xl font-bold">{source.name}</h1><p>{source.steps.length} ขั้นตอน · ฉบับที่ {source.version}</p><p>เมื่อใช้กับคดี ระบบจะสร้างงานตามขั้นตอนด้านล่างให้ทีมคดีพร้อมกำหนดส่ง</p><Link href={`/cases?sop=${encodeURIComponent(source.id)}`} className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-primary-foreground">ใช้กับคดี</Link><p className="text-xs text-muted-foreground">เลือกคดีแล้วระบบเพิ่มงานตามชุดนี้ให้ — ถามยืนยันก่อนสร้าง</p></section>
    <div className="grid gap-6 lg:grid-cols-3"><section className="rounded-xl border bg-card p-6 lg:col-span-2"><h2 className="text-xl font-semibold">ขั้นตอน · {source.steps.length} ขั้นตอน</h2><ol className="mt-4 divide-y">{source.steps.map((step, index) => <li key={index} className="flex gap-4 py-4"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border">{index + 1}</span><div className="min-w-0"><h3 className="break-words font-semibold">{step.title}</h3><p className="mt-1 text-sm text-muted-foreground">{[step.primaryRole && `ผู้ทำ: ${FIRM_ROLE_LABELS[step.primaryRole]?.th ?? step.primaryRole}`, step.offsetDays != null && `ภายใน ${step.offsetDays} วัน`, step.requiresAttachment && 'ต้องแนบไฟล์'].filter(Boolean).join(' · ')}</p>{step.instructions && <p className="mt-2 whitespace-pre-wrap text-sm">{step.instructions}</p>}</div></li>)}</ol></section><aside className="h-fit rounded-xl border bg-card p-6"><h2 className="font-semibold">รายการตรวจเอกสาร</h2><p className="mt-2 text-sm text-muted-foreground">เอกสารที่ชุดงานนี้กำหนดให้เตรียมและแนบในสำนวน</p><ul className="mt-4 space-y-2">{requiredDocs.map(doc => <li className="rounded-md border p-3" key={doc}>{documentCategoryLabel(doc as DocumentCategory, 'th')}</li>)}</ul></aside></div>
  </div>;
  if (user && !hasFirmCapability(user.firmRole, 'manageFirmContent') && isNew) return <div>{backTo('/sops?tab=playbooks', 'คู่มือการทำงาน')}</div>;
  if (loadError) return <div className="space-y-3">{backTo('/playbooks', th ? 'ชุดงานอัตโนมัติ' : 'SOP list')}<LoadFailed message={loadError} onRetry={() => setReload(value => value + 1)} /></div>;
  if (!isNew && !source) return <div className="space-y-3"><p role="alert">{th ? 'ไม่พบชุดงานนี้' : 'SOP not found'}</p>{backTo('/playbooks', th ? 'ชุดงานอัตโนมัติ' : 'SOP list')}</div>;

  return <div className="mx-auto max-w-[1440px] space-y-6 pb-32">
    <header className="border-b pb-5">
      <nav aria-label="เส้นทาง" className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"><Link href="/sops">คู่มือการทำงาน</Link><span>/</span><Link href="/sops?tab=playbooks">ชุดงานอัตโนมัติ</Link><span>/</span><span>แก้ไข</span></nav>
      <div className="mt-2 flex flex-wrap items-center gap-3"><h1 className="text-3xl font-bold">{name || 'ชุดงานอัตโนมัติใหม่'}</h1>{hasChanges && <Badge variant="warning">ฉบับร่าง · จะเป็นฉบับที่ {(source?.version ?? 0) + 1}</Badge>}</div>
      {publishError && <p role="alert" className="mt-2 text-sm text-destructive">{publishError}</p>}
    </header>
    <div className="grid min-w-0 gap-6 lg:grid-cols-3 lg:items-start">
    <div className="min-w-0 space-y-5 lg:col-span-2">
    <details ref={nameRef} key={`name-${id}`} open={isNew || undefined} className="group rounded-xl border bg-card">
      <summary className="disclosure flex min-h-20 cursor-pointer items-center gap-4 p-4"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">1</span><span className="min-w-0 flex-1"><span className="block font-semibold">ตั้งชื่อชุดงาน</span><span className="block break-words text-sm text-muted-foreground">{name || 'กรอกชื่อชุดงาน'}</span></span>{name.trim() && <Badge variant="success">✓ ครบแล้ว</Badge>}</summary>
      <div className="border-t p-4"><TextField id="sop-name" label="ชื่อชุดงานอัตโนมัติ" error={publishErrors.name} className={publishErrors.name ? 'border-destructive' : undefined} required maxLength={150} value={name} onChange={e => setName(e.target.value)} placeholder="เช่น คดีอาญามาตรฐาน" /></div>
    </details>
    <QuickFlowCanvas key={`flow-${id}`} steps={steps} setSteps={setSteps} th={th} stepsError={publishErrors.steps} titleErrors={publishErrors.stepTitles} />
    <details ref={settingsRef} key={`settings-${id}`} className="group rounded-xl border bg-card">
      <summary className="disclosure flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 p-4 font-medium [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 items-center gap-4"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">3</span><span><span className="block">ประเภทคดีและรายการตรวจเอกสาร (ไม่บังคับ)</span><span className="block text-sm font-normal text-muted-foreground">{caseTypes.find(t => t.id === caseTypeId)?.name ?? 'ไม่ระบุประเภทคดี'} · รายการตรวจ {requiredDocs.length} รายการ</span></span></span>
        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="space-y-4 border-t p-4">
        <div className="grid gap-4 md:grid-cols-2">
          <SelectField label={th ? 'ผูกกับประเภทคดี (ถ้ามี)' : 'Linked case type (optional)'} value={caseTypeId} onChange={e => handleCaseTypeLink(e.target.value)}>
            <option value="">{th ? 'ไม่ผูก' : 'Not linked'}</option>
            {caseTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            <option value="__new__">{th ? 'สร้างประเภทคดีใหม่' : 'Create case type'}</option>
          </SelectField>
        </div>
        {creatingCaseType && <div className="flex flex-wrap items-end gap-2">
          <TextField label={th ? 'ชื่อประเภทคดีใหม่' : 'New case type'} error={caseTypeError} className={caseTypeError ? 'border-destructive' : undefined} maxLength={100} value={newCaseTypeName} onChange={e => { setNewCaseTypeName(e.target.value); setCaseTypeError(''); }} containerClassName="min-w-0 flex-1" />
          <Button disabled={busy} onClick={createCaseType}>{th ? 'สร้าง' : 'Create'}</Button>
          <Button variant="ghost" onClick={() => { setCreatingCaseType(false); setCaseTypeError(''); }}>{th ? 'ยกเลิก' : 'Cancel'}</Button>
        </div>}
        {caseTypeId && <div className="space-y-2 border-t pt-4">
          <p className="text-sm font-medium">{th ? 'เอกสารที่ประเภทคดีนี้ต้องมี' : 'Documents required for this case type'} <span className="font-normal text-muted-foreground">· บันทึกเมื่อเผยแพร่</span></p>
          <div className="flex flex-wrap gap-2">
            {Object.values(DocumentCategory).map(value => <button type="button" key={value} disabled={docSaving} aria-pressed={requiredDocs.includes(value)} onClick={() => toggleDoc(value)} className={`min-h-11 rounded-full border px-3 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 ${requiredDocs.includes(value) ? 'border-primary bg-primary/10 text-primary' : 'border-input text-muted-foreground'}`}>{documentCategoryLabel(value, th ? 'th' : 'en')}</button>)}
            {requiredDocs.filter(d => !(Object.values(DocumentCategory) as string[]).includes(d)).map(value => <button type="button" key={value} disabled={docSaving} onClick={() => toggleDoc(value)} aria-label={th ? `เอาออก: ${value}` : `Remove ${value}`} className="inline-flex min-h-11 items-center gap-1 rounded-full border border-primary bg-primary/10 px-3 py-1 text-xs text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">{value}<X className="h-3.5 w-3.5" aria-hidden /></button>)}
          </div>
          <div className="flex flex-wrap items-end gap-2"><TextField label={th ? 'เพิ่มเอกสารอื่น' : 'Add another document'} error={customDocError} className={customDocError ? 'border-destructive' : undefined} maxLength={100} value={customDoc} onChange={e => { setCustomDoc(e.target.value); setCustomDocError(''); }} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (!docSaving) addCustomDoc(); } }} containerClassName="min-w-0 flex-1" /><Button variant="outline" disabled={docSaving} onClick={addCustomDoc}>{th ? 'เพิ่ม' : 'Add'}</Button></div>
          {docsError && <p role="alert" className="text-xs text-destructive">{docsError}</p>}
        </div>}
        {templateKey === CARGO_PLAYBOOK_KEY && <div className="space-y-2 border-t pt-4">
          <p className="text-sm font-medium">{th ? 'รายการตรวจเอกสารสินค้าขนส่งของฉบับนี้' : 'Cargo document checklist for this version'}</p>
          <p className="text-xs text-muted-foreground">{th ? 'เรื่องใหม่จะใช้รายการนี้ เรื่องเดิมไม่เปลี่ยนตาม' : 'New matters use this list; existing matters are unchanged.'}</p>
          {publishErrors.cargoSummary && <p id="cargo-requirements" tabIndex={-1} role="alert" className="text-xs text-destructive">{publishErrors.cargoSummary}</p>}
          {cargoRequirements.map((item, index) => <div key={item.code} className="flex flex-wrap items-center gap-2"><span className="w-6 text-xs text-muted-foreground">{index + 1}</span><div className="min-w-0 flex-1"><Input id={`cargo-label-${index}`} aria-label={th ? `เอกสารสินค้าขนส่ง ${index + 1}` : `Cargo document ${index + 1}`} aria-invalid={!!publishErrors.cargo?.[index]} aria-describedby={publishErrors.cargo?.[index] ? `cargo-label-${index}-error` : undefined} maxLength={300} value={item.label} onChange={e => setCargoRequirements(rows => rows.map((row, i) => i === index ? { ...row, label: e.target.value } : row))} className={publishErrors.cargo?.[index] ? 'border-destructive' : undefined} />{publishErrors.cargo?.[index] && <p id={`cargo-label-${index}-error`} role="alert" className="mt-1 text-xs text-destructive">{publishErrors.cargo[index]}</p>}</div><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={item.requiredByDefault} onChange={e => setCargoRequirements(rows => rows.map((row, i) => i === index ? { ...row, requiredByDefault: e.target.checked } : row))} />{th ? 'ต้องมีตั้งต้น' : 'Required by default'}</label></div>)}
        </div>}
      </div>
    </details>

    </div>
    <form className="min-w-0 lg:sticky lg:top-6" onSubmit={event => { event.preventDefault(); void publish(); }}>
      <aside className="rounded-xl border bg-card p-5"><h2 className="text-lg font-semibold">ก่อนเผยแพร่</h2><ul className="my-4 space-y-3 border-t pt-4 text-sm">{publishItems.map(item => <li key={item.label} className={item.done ? 'text-green-700' : 'text-amber-700'}>{item.done ? '✓' : '⚠'} {item.label}</li>)}</ul><div className="space-y-3 border-t pt-4 text-sm"><p>ฉบับปัจจุบันที่ทีมใช้งาน: {source ? `ฉบับที่ ${source.version}` : 'ยังไม่มี'}</p><p className="rounded-md bg-muted p-3 text-muted-foreground">การเผยแพร่ฉบับที่ {(source?.version ?? 0) + 1} จะมีผลกับคดีที่เปิดใหม่ทันที</p></div><Button type="submit" disabled={busy} className="mt-4 w-full">เผยแพร่ฉบับที่ {(source?.version ?? 0) + 1}</Button><p className="mt-1 text-xs text-muted-foreground">ตรวจข้อมูลและสรุปการเปลี่ยนแปลงก่อนเผยแพร่</p></aside>
    </form>
    </div>
    {confirmPublish && <PublishDialog version={(source?.version ?? 0) + 1} steps={steps} docs={requiredDocs.length} busy={busy} error={publishError} onCancel={() => setConfirmPublish(false)} onConfirm={() => void publish(true)} />}
    {success && <SuccessModal success={success} th={th} onClose={() => {
      const publishedId = success.publishedId;
      setSuccess(null);
      if (publishedId) router.replace(`/playbooks/${publishedId}`);
    }} />}
  </div>;
}

function SuccessModal({ success, th, onClose }: { success: Success; th: boolean; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return <dialog ref={dialogRef} onClose={onClose} aria-labelledby="sop-success-title" aria-describedby="sop-success-description" className="w-[min(92vw,420px)] rounded-xl border bg-card p-6 text-foreground shadow-xl backdrop:bg-black/40">
    <CheckCircle2 className="mb-3 h-8 w-8 text-success" aria-hidden="true" />
    <h2 id="sop-success-title" className="text-lg font-semibold">{success.title}</h2>
    <p id="sop-success-description" className="mt-1 text-sm text-muted-foreground">{success.description}</p>
    <div className="mt-5 flex justify-end"><Button autoFocus onClick={() => dialogRef.current?.close()}>{success.publishedId ? (th ? 'ดูชุดงานฉบับใหม่' : 'View new SOP version') : (th ? 'เสร็จสิ้น' : 'Done')}</Button></div>
  </dialog>;
}

function PublishDialog({ version, steps, docs, busy, error, onCancel, onConfirm }: { version: number; steps: PlaybookStep[]; docs: number; busy: boolean; error: string; onCancel: () => void; onConfirm: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} onCancel={onCancel} aria-labelledby="publish-title" className="w-[min(92vw,640px)] rounded-xl border bg-card p-6 text-foreground shadow-xl backdrop:bg-black/40"><h2 id="publish-title" className="text-xl font-semibold">เผยแพร่ฉบับที่ {version}?</h2><div className="my-5 space-y-3 border-y py-5"><p>{steps.length} ขั้นตอน</p><p>ใช้กับคดีใหม่ตั้งแต่วันนี้ คดีเดิมยังใช้ฉบับเดิม</p><p>รายการตรวจเอกสาร {docs} รายการ</p>{steps.some(step => !step.primaryRole) && <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-800">บางขั้นตอนยังไม่มีผู้ทำ โปรดตรวจสอบก่อนเผยแพร่</p>}</div>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<div className="flex flex-wrap justify-between gap-3"><Button variant="outline" onClick={onCancel}>กลับไปแก้</Button><Button disabled={busy} onClick={onConfirm}>{busy ? 'กำลังเผยแพร่…' : `เผยแพร่ฉบับที่ ${version}`}</Button></div><p className="mt-2 text-right text-xs text-muted-foreground">ทีมจะเห็นฉบับนี้ทันที</p></dialog>;
}
