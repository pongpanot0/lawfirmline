'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { DocumentCategory } from '@lawfirm/shared';
import { CheckCircle2, ChevronDown, Zap } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useLocale } from '@/components/landing/LocaleProvider';
import { api, CaseTypeItem } from '@/lib/api';
import { CargoPlaybookRequirement, PlaybookRelease, PlaybookStep, setupRequest } from '@/lib/practice-setup';
import { documentCategoryLabel } from '@/lib/stage-labels';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TextField } from '@/components/ui/form-fields';
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
        if (!isNew && !found) { setLoadError(th ? 'ไม่พบ SOP นี้' : 'SOP not found'); return; }
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
      .catch(e => { if (active) setLoadError(e instanceof Error ? e.message : 'Failed'); })
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
    } catch (e) { setCaseTypeError(e instanceof Error ? e.message : 'Failed'); } finally { setBusy(false); }
  };

  // เอกสารที่ต้องมีเป็นข้อมูลของประเภทคดี บันทึกทันที ไม่ต้องรอเผยแพร่ SOP
  const saveRequiredDocs = async (next: string[]) => {
    if (!token || !caseTypeId) return false;
    const previous = requiredDocs;
    setDocsError('');
    setRequiredDocs(next);
    setDocSaving(true);
    try {
      await api.updateCaseType(token, caseTypeId, { requiredDocuments: next }, true);
      setCaseTypes(list => list.map(t => t.id === caseTypeId ? { ...t, requiredDocuments: next } : t));
      setSuccess({ title: th ? 'บันทึกรายการเอกสารแล้ว' : 'Document list saved', description: th ? 'รายการเอกสารของประเภทคดีนี้อัปเดตแล้ว' : 'The case type document list is up to date.' });
      return true;
    } catch (e) { setRequiredDocs(previous); setDocsError(e instanceof Error ? e.message : 'Failed'); return false; } finally { setDocSaving(false); }
  };
  const toggleDoc = (value: string) => saveRequiredDocs(requiredDocs.includes(value) ? requiredDocs.filter(v => v !== value) : [...requiredDocs, value]);
  const addCustomDoc = async () => {
    const value = customDoc.trim();
    if (!value) { setCustomDocError(th ? 'กรอกชื่อเอกสารก่อน' : 'Enter a document name.'); return; }
    if (requiredDocs.includes(value)) { setCustomDocError(th ? 'มีเอกสารนี้ในรายการแล้ว' : 'This document is already listed.'); return; }
    setCustomDocError('');
    if (await saveRequiredDocs([...requiredDocs, value])) setCustomDoc('');
  };

  const publish = async () => {
    if (!token || busy) return;
    const invalidRoutine = steps.find(step => step.routine && (!step.instructions.trim() || !step.routine.expectedOutput.trim() || !step.routine.checks.some(check => check.trim())));
    if (invalidRoutine) { setPublishError(th ? `${invalidRoutine.title}: กรอกวิธีทำ ผลที่ต้องส่ง และรายการตรวจก่อนเผยแพร่` : `${invalidRoutine.title}: Add instructions, expected result and checks.`); return; }
    const stepTitles = Object.fromEntries(steps.map((step, index) => [index, !step.title.trim() ? (th ? 'กรอกชื่องานก่อน' : 'Enter a task name.') : '']).filter(([, message]) => message)) as Record<number, string>;
    const cargo = templateKey === CARGO_PLAYBOOK_KEY ? Object.fromEntries(cargoRequirements.map((item, index) => [index, !item.label.trim() ? (th ? 'กรอกชื่อเอกสารก่อน' : 'Enter a document name.') : '']).filter(([, message]) => message)) as Record<number, string> : {};
    const errors: PublishErrors = {
      name: !name.trim() ? (th ? 'กรอกชื่อ SOP ก่อน' : 'Enter an SOP name.') : undefined,
      steps: steps.length === 0 ? (th ? 'เพิ่มงานอย่างน้อย 1 ขั้นตอน' : 'Add at least one task.') : undefined,
      stepTitles,
      cargo,
      cargoSummary: templateKey === CARGO_PLAYBOOK_KEY && cargoRequirements.length === 0 ? (th ? 'เพิ่มรายการเอกสาร Cargo อย่างน้อย 1 รายการ' : 'Add at least one Cargo document.') : undefined,
    };
    setPublishErrors(errors);
    if (errors.name || errors.steps || Object.keys(stepTitles).length || Object.keys(cargo).length || errors.cargoSummary) {
      if (Object.keys(cargo).length || errors.cargoSummary) settingsRef.current?.setAttribute('open', '');
      requestAnimationFrame(() => document.getElementById(errors.name ? 'sop-name' : Object.keys(stepTitles).length ? `sop-step-title-${Object.keys(stepTitles)[0]}` : errors.cargoSummary ? 'cargo-requirements' : `cargo-label-${Object.keys(cargo)[0]}`)?.focus());
      return;
    }
    setBusy(true); setPublishError('');
    try {
      const published = await setupRequest<PlaybookRelease>(token, '/playbooks', {
        name: name.trim(), caseTypeId: caseTypeId || undefined, steps: steps.map(step => ({ ...step, ...(step.routine ? { routine: { ...step.routine, checks: step.routine.checks.map(check => check.trim()).filter(Boolean) } } : {}) })),
        ...(templateKey === CARGO_PLAYBOOK_KEY ? { templateKey, cargoTemplate: { requirements: cargoRequirements } } : {}),
      }, true);
      setSuccess({ title: th ? 'บันทึกและเผยแพร่ SOP แล้ว' : 'SOP saved and published', description: `${published.name} · v${published.version}`, publishedId: published.id });
    } catch (e) { setPublishError(e instanceof Error ? e.message : 'Failed'); } finally { setBusy(false); }
  };

  const hasChanges = isNew || !source || name !== source.name || caseTypeId !== (source.caseTypeId ?? '') ||
    JSON.stringify(steps) !== JSON.stringify(source.steps) ||
    JSON.stringify(cargoRequirements) !== JSON.stringify(source.cargoTemplate?.requirements ?? []);
  const canPublish = hasChanges && !busy;

  if (loading) return <p className="p-6 text-sm text-muted-foreground">{th ? 'กำลังโหลด SOP…' : 'Loading SOP…'}</p>;
  if (user && user.firmRole !== 'OWNER') return <div className="space-y-3"><p>{th ? 'เฉพาะเจ้าของสำนักงานแก้ไข SOP อัตโนมัติได้' : 'Only the firm owner can edit automated SOPs.'}</p><Link href="/sops" className="text-primary underline">← SOP</Link></div>;
  if (loadError) return <div className="space-y-3"><p role="alert" className="text-sm text-destructive">{loadError}</p><div className="flex gap-3"><Button variant="outline" onClick={() => setReload(value => value + 1)}>{th ? 'ลองโหลดอีกครั้ง' : 'Retry'}</Button><Link href="/playbooks" className="self-center text-sm text-primary underline">← {th ? 'รายการ SOP' : 'SOP list'}</Link></div></div>;
  if (!isNew && !source) return <div className="space-y-3"><p role="alert">{th ? 'ไม่พบ SOP นี้' : 'SOP not found'}</p><Link href="/playbooks" className="text-primary underline">← {th ? 'รายการ SOP' : 'SOP list'}</Link></div>;

  return <div className="mx-auto max-w-[1440px] space-y-5 pb-12">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <Link href="/sops" className="text-sm text-primary">← {th ? 'คู่มือการทำงาน' : 'SOP library'}</Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="max-w-[780px] truncate text-2xl font-semibold">{name || (th ? 'SOP ใหม่' : 'New SOP')}</h1>
          {source && <span className="rounded-full border bg-card px-2.5 py-1 text-xs text-muted-foreground">v{source.version}</span>}
          {hasChanges && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs text-amber-900">{th ? 'ยังไม่เผยแพร่' : 'Unpublished changes'}</span>}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{th ? 'พิมพ์ชื่องานแล้วกด Enter เพื่อเพิ่มขั้นตอน รายละเอียดอื่นแก้เพิ่มได้ทีหลัง' : 'Type a task name and press Enter. Other details can be added later.'}</p>
      </div>
      <div className="text-right"><Button disabled={!canPublish} onClick={publish} className="shrink-0"><Zap className="mr-2 h-4 w-4" />{busy ? (th ? 'กำลังบันทึก…' : 'Saving…') : (th ? 'บันทึกและเผยแพร่' : 'Save and publish')}</Button><p className="mt-1 text-xs text-muted-foreground">{th ? 'บันทึกเป็นรุ่นใหม่ ไม่เปลี่ยนงานในคดีเดิม' : 'Creates a new version; existing case tasks stay unchanged.'}</p>{publishError && <p role="alert" className="mt-2 max-w-xs text-left text-xs text-destructive">{publishError}</p>}</div>
    </header>

    <div className="mx-auto max-w-3xl">
      <TextField id="sop-name" label={th ? 'ชื่อ SOP' : 'SOP name'} error={publishErrors.name} className={publishErrors.name ? 'border-destructive' : undefined} required maxLength={150} value={name} onChange={e => setName(e.target.value)} placeholder={th ? 'เช่น คดีอาญามาตรฐาน' : 'e.g. Criminal litigation'} />
    </div>
    <details ref={settingsRef} key={`settings-${id}`} className="group mx-auto max-w-3xl rounded-xl border bg-card">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 font-medium [&::-webkit-details-marker]:hidden">
        <span>{th ? 'ประเภทคดีและเอกสาร (ไม่บังคับ)' : 'Case type and documents (optional)'}</span>
        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-4 border-t p-4">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm">{th ? 'ผูกกับประเภทคดี (ถ้ามี)' : 'Linked case type (optional)'}
            <select className="mt-1 h-9 w-full rounded-lg border bg-background px-2" value={caseTypeId} onChange={e => handleCaseTypeLink(e.target.value)}>
              <option value="">{th ? 'ไม่ผูก' : 'Not linked'}</option>
              {caseTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              <option value="__new__">{th ? '+ สร้างประเภทคดีใหม่' : '+ Create case type'}</option>
            </select>
          </label>
        </div>
        {creatingCaseType && <div className="flex flex-wrap items-end gap-2">
          <TextField label={th ? 'ชื่อประเภทคดีใหม่' : 'New case type'} error={caseTypeError} className={caseTypeError ? 'border-destructive' : undefined} maxLength={100} value={newCaseTypeName} onChange={e => { setNewCaseTypeName(e.target.value); setCaseTypeError(''); }} containerClassName="min-w-[220px] flex-1" />
          <Button disabled={busy} onClick={createCaseType}>{th ? 'สร้าง' : 'Create'}</Button>
          <Button variant="ghost" onClick={() => { setCreatingCaseType(false); setCaseTypeError(''); }}>{th ? 'ยกเลิก' : 'Cancel'}</Button>
        </div>}
        {caseTypeId && <div className="space-y-2 border-t pt-4">
          <p className="text-sm font-medium">{th ? 'เอกสารที่ประเภทคดีนี้ต้องมี' : 'Documents required for this case type'} <span className="font-normal text-muted-foreground">{docSaving ? (th ? '· กำลังบันทึก…' : '· Saving…') : (th ? '· เปลี่ยนแล้วบันทึกทันที' : '· Changes save immediately')}</span></p>
          <div className="flex flex-wrap gap-2">
            {Object.values(DocumentCategory).map(value => <button type="button" key={value} disabled={docSaving} onClick={() => toggleDoc(value)} className={`rounded-full border px-3 py-1 text-xs disabled:opacity-50 ${requiredDocs.includes(value) ? 'border-primary bg-primary/10 text-primary' : 'border-input text-muted-foreground'}`}>{documentCategoryLabel(value, th ? 'th' : 'en')}</button>)}
            {requiredDocs.filter(d => !(Object.values(DocumentCategory) as string[]).includes(d)).map(value => <button type="button" key={value} disabled={docSaving} onClick={() => toggleDoc(value)} className="rounded-full border border-primary bg-primary/10 px-3 py-1 text-xs text-primary disabled:opacity-50">{value} ×</button>)}
          </div>
          <div className="flex flex-wrap items-end gap-2"><TextField label={th ? 'เพิ่มเอกสารอื่น' : 'Add another document'} error={customDocError} className={customDocError ? 'border-destructive' : undefined} maxLength={100} value={customDoc} onChange={e => { setCustomDoc(e.target.value); setCustomDocError(''); }} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (!docSaving) addCustomDoc(); } }} containerClassName="min-w-[220px] flex-1" /><Button variant="outline" disabled={docSaving} onClick={addCustomDoc}>{th ? 'เพิ่ม' : 'Add'}</Button></div>
          {docsError && <p role="alert" className="text-xs text-destructive">{docsError}</p>}
        </div>}
        {templateKey === CARGO_PLAYBOOK_KEY && <div className="space-y-2 border-t pt-4">
          <p className="text-sm font-medium">{th ? 'Checklist เอกสาร Cargo ของรุ่นนี้' : 'Cargo document checklist for this version'}</p>
          <p className="text-xs text-muted-foreground">{th ? 'เรื่องใหม่จะใช้รายการนี้ เรื่องเดิมไม่เปลี่ยนตาม' : 'New matters use this list; existing matters are unchanged.'}</p>
          {publishErrors.cargoSummary && <p id="cargo-requirements" tabIndex={-1} role="alert" className="text-xs text-destructive">{publishErrors.cargoSummary}</p>}
          {cargoRequirements.map((item, index) => <div key={item.code} className="flex flex-wrap items-center gap-2"><span className="w-6 text-xs text-muted-foreground">{index + 1}</span><div className="min-w-[240px] flex-1"><Input id={`cargo-label-${index}`} aria-label={th ? `เอกสาร Cargo ${index + 1}` : `Cargo document ${index + 1}`} aria-invalid={!!publishErrors.cargo?.[index]} aria-describedby={publishErrors.cargo?.[index] ? `cargo-label-${index}-error` : undefined} maxLength={300} value={item.label} onChange={e => setCargoRequirements(rows => rows.map((row, i) => i === index ? { ...row, label: e.target.value } : row))} className={publishErrors.cargo?.[index] ? 'border-destructive' : undefined} />{publishErrors.cargo?.[index] && <p id={`cargo-label-${index}-error`} role="alert" className="mt-1 text-xs text-destructive">{publishErrors.cargo[index]}</p>}</div><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={item.requiredByDefault} onChange={e => setCargoRequirements(rows => rows.map((row, i) => i === index ? { ...row, requiredByDefault: e.target.checked } : row))} />{th ? 'ต้องมีตั้งต้น' : 'Required by default'}</label></div>)}
        </div>}
      </div>
    </details>

    <QuickFlowCanvas key={`flow-${id}`} steps={steps} setSteps={setSteps} th={th} stepsError={publishErrors.steps} titleErrors={publishErrors.stepTitles} />
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
    <CheckCircle2 className="mb-3 h-8 w-8 text-emerald-600" aria-hidden="true" />
    <h2 id="sop-success-title" className="text-lg font-semibold">{success.title}</h2>
    <p id="sop-success-description" className="mt-1 text-sm text-muted-foreground">{success.description}</p>
    <div className="mt-5 flex justify-end"><Button autoFocus onClick={() => dialogRef.current?.close()}>{success.publishedId ? (th ? 'ดู SOP รุ่นใหม่' : 'View new SOP version') : (th ? 'เสร็จสิ้น' : 'Done')}</Button></div>
  </dialog>;
}
