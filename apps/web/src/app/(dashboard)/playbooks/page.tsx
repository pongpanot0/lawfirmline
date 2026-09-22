'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { DocumentCategory } from '@lawfirm/shared';
import { useAuth } from '@/lib/auth';
import { useLocale } from '@/components/landing/LocaleProvider';
import { CargoPlaybookRequirement, PlaybookRelease, PlaybookStep, FirmRoleStr, setupRequest } from '@/lib/practice-setup';
import { api, CaseTypeItem } from '@/lib/api';
import { documentCategoryLabel } from '@/lib/stage-labels';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const ROLE_LABELS: Record<FirmRoleStr, { th: string; en: string }> = {
  OWNER: { th: 'เจ้าของสำนักงาน', en: 'Firm owner' },
  SENIOR_LAWYER: { th: 'ทนายอาวุโส', en: 'Senior lawyer' },
  LAWYER: { th: 'ทนาย', en: 'Lawyer' },
  ASSISTANT: { th: 'ผู้ช่วย', en: 'Assistant' },
};
const ROLE_OPTIONS = Object.keys(ROLE_LABELS) as FirmRoleStr[];
const CARGO_PLAYBOOK_KEY = 'CARGO_CLAIM_ASSESSMENT';

export default function PlaybooksPage() {
  const { token, user } = useAuth(); const { locale } = useLocale(); const th = locale === 'th';
  const [items, setItems] = useState<PlaybookRelease[]>([]);
  const [caseTypes, setCaseTypes] = useState<CaseTypeItem[]>([]);
  const [editing, setEditing] = useState(false);
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
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [notice, setNotice] = useState('');

  const load = async () => {
    if (!token) return;
    const [playbooks, types] = await Promise.all([
      setupRequest<PlaybookRelease[]>(token, '/playbooks'),
      api.getCaseTypes(token, false),
    ]);
    setItems(playbooks); setCaseTypes(types);
  };
  useEffect(() => { load().catch(e => setError(e.message)); }, [token]);

  const resetForm = () => {
    setEditing(true); setCreatingCaseType(false);
    setName(''); setCaseTypeId(''); setSteps([]); setRequiredDocs([]); setTemplateKey(null); setCargoRequirements([]);
    setNotice(''); setError('');
  };

  const startDraft = (playbook: PlaybookRelease) => {
    setEditing(true); setCreatingCaseType(false);
    setName(playbook.name);
    setCaseTypeId(playbook.caseTypeId ?? '');
    setRequiredDocs(caseTypes.find(t => t.id === playbook.caseTypeId)?.requiredDocuments ?? []);
    setTemplateKey(playbook.templateKey ?? null);
    setCargoRequirements(structuredClone(playbook.cargoTemplate?.requirements ?? []));
    setSteps(structuredClone(playbook.steps));
    setNotice(''); setError('');
  };

  const handleCaseTypeLink = (value: string) => {
    if (value === '__new__') { setCreatingCaseType(true); setNewCaseTypeName(''); return; }
    setCreatingCaseType(false);
    setCaseTypeId(value);
    setRequiredDocs(caseTypes.find(t => t.id === value)?.requiredDocuments ?? []);
  };

  const createCaseType = async () => {
    if (!token || !newCaseTypeName.trim()) return;
    setBusy(true); setError('');
    try {
      const created = await api.createCaseType(token, { name: newCaseTypeName.trim() });
      setCaseTypes(list => [...list, created]);
      setCreatingCaseType(false);
      setCaseTypeId(created.id);
      setRequiredDocs([]);
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); } finally { setBusy(false); }
  };

  const edit = (index: number, patch: Partial<PlaybookStep>) => setSteps(rows => rows.map((s, i) => i === index ? { ...s, ...patch } : s));

  // เอกสารที่ต้องมีเป็นของ CaseType โดยตรง — เปลี่ยนแล้วบันทึกทันที ไม่ต้องรอกดเผยแพร่ Playbook
  const saveRequiredDocs = async (next: string[]) => {
    if (!token || !caseTypeId) return;
    setRequiredDocs(next);
    setDocSaving(true);
    try {
      await api.updateCaseType(token, caseTypeId, { requiredDocuments: next });
      setCaseTypes(list => list.map(t => t.id === caseTypeId ? { ...t, requiredDocuments: next } : t));
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); } finally { setDocSaving(false); }
  };
  const toggleDoc = (value: string) => saveRequiredDocs(requiredDocs.includes(value) ? requiredDocs.filter(v => v !== value) : [...requiredDocs, value]);
  const addCustomDoc = () => {
    const value = customDoc.trim();
    if (!value || requiredDocs.includes(value)) { setCustomDoc(''); return; }
    saveRequiredDocs([...requiredDocs, value]);
    setCustomDoc('');
  };

  const publish = async () => {
    if (!token || !name.trim() || !steps.length) return;
    setBusy(true); setError('');
    try {
      const p = await setupRequest<PlaybookRelease>(token, '/playbooks', {
        name: name.trim(), caseTypeId: caseTypeId || undefined, steps,
        ...(templateKey === CARGO_PLAYBOOK_KEY ? { templateKey, cargoTemplate: { requirements: cargoRequirements } } : {}),
      });
      setNotice(`${p.name} v${p.version} · ${th ? 'เผยแพร่แล้ว' : 'Published'}`);
      setEditing(false);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); } finally { setBusy(false); }
  };

  return <div className="mx-auto max-w-4xl space-y-6">
    <header>
      <h1 className="text-2xl font-semibold">Playbooks</h1>
      <p className="mt-1 text-sm text-muted-foreground">{th ? 'วิธีทำงานมาตรฐานของแต่ละประเภทงาน — ต้องทำอะไรบ้าง ใครทำ พนักงานใหม่เปิดมาก็รู้ทันที' : 'The standard way to work each type of matter — what to do, and who does it.'}</p>
    </header>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {notice && <p role="status">{notice}</p>}

    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">{th ? 'Playbook ที่มีอยู่' : 'Existing playbooks'}</h2>
        {user?.firmRole === 'OWNER' && !editing && <Button type="button" onClick={resetForm}>{th ? '+ สร้าง Playbook ใหม่' : '+ New playbook'}</Button>}
      </div>
      {!items.length && <p className="text-sm text-muted-foreground">{th ? 'ยังไม่มี Playbook เลย' : 'No playbooks yet.'}</p>}
      {items.map(p => <details key={p.id} className="rounded-lg border bg-card p-4">
        <summary className="cursor-pointer font-medium">{p.name} · v{p.version}{p.templateKey === CARGO_PLAYBOOK_KEY && <span className="ml-2 rounded-full bg-primary/10 px-2 py-1 text-xs font-normal text-primary">Cargo · {p.cargoTemplate?.requirements.length ?? 0} docs</span>}{p.caseTypeId && <span className="ml-2 text-xs font-normal text-muted-foreground">· {th ? 'ผูกกับ' : 'linked to'} {caseTypes.find(t => t.id === p.caseTypeId)?.name ?? '—'}</span>}</summary>
        <ol className="my-3 list-decimal space-y-2 pl-5 text-sm">
          {p.steps.map((s, i) => <li key={i}>{s.title}
            <p className="text-xs text-muted-foreground">
              {[s.primaryRole && ROLE_LABELS[s.primaryRole][th ? 'th' : 'en'], s.secondaryRole && `${th ? 'สำรอง' : 'backup'}: ${ROLE_LABELS[s.secondaryRole][th ? 'th' : 'en']}`].filter(Boolean).join(' · ')}
            </p>
            {s.instructions && <p className="text-xs text-muted-foreground">{s.instructions}</p>}
          </li>)}
        </ol>
        {user?.firmRole === 'OWNER' && <Button variant="outline" onClick={() => startDraft(p)}>{th ? 'แก้ไข / ออกรุ่นถัดไป' : 'Edit / draft next version'}</Button>}
      </details>)}
    </section>

    {user?.firmRole === 'OWNER' && editing && <div className="space-y-4 rounded-xl border bg-card p-4 sm:p-6">
      <h2 className="text-lg font-semibold">{th ? 'สร้าง / แก้ไข Playbook' : 'Create / edit a playbook'}</h2>

      <label className="block text-sm">{th ? 'ชื่อประเภทการทำงาน' : 'Type of work'}
        <Input required maxLength={150} value={name} onChange={e => setName(e.target.value)} placeholder={th ? 'เช่น เก็บหลักฐานทางการแพทย์' : 'e.g. Gathering medical evidence'} />
      </label>

      <div className="space-y-2 rounded-lg border p-3">
        <label className="block text-sm">{th ? 'ผูกกับประเภทคดี (ถ้ามี — ให้ระบบแนะนำ Playbook นี้อัตโนมัติตอนเปิดคดี)' : 'Link to a case type (optional — auto-suggests this playbook on matching cases)'}
          <select className="mt-1 h-11 w-full rounded-lg border bg-background px-2" value={caseTypeId} onChange={e => handleCaseTypeLink(e.target.value)}>
            <option value="">{th ? '— ไม่ผูก —' : '— Not linked —'}</option>
            {caseTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            <option value="__new__">{th ? '+ สร้างประเภทคดีใหม่' : '+ Create a new case type'}</option>
          </select>
        </label>
        {creatingCaseType && <div className="flex flex-wrap items-end gap-2">
          <label className="block flex-1 min-w-[200px] text-sm">{th ? 'ชื่อประเภทคดีใหม่' : 'New case type name'}
            <Input autoFocus maxLength={100} value={newCaseTypeName} onChange={e => setNewCaseTypeName(e.target.value)} placeholder={th ? 'เช่น คดีล้มละลาย' : 'e.g. Bankruptcy'} />
          </label>
          <Button type="button" disabled={busy || !newCaseTypeName.trim()} onClick={createCaseType}>{th ? 'สร้าง' : 'Create'}</Button>
          <Button type="button" variant="ghost" onClick={() => setCreatingCaseType(false)}>{th ? 'ยกเลิก' : 'Cancel'}</Button>
        </div>}
      </div>

      {caseTypeId && <div className="space-y-2 rounded-lg border p-3">
        <p className="text-sm font-medium">{th ? 'เอกสารที่ประเภทคดีนี้ต้องมี' : 'Documents this case type should have'}{docSaving && <span className="ml-2 text-xs font-normal text-muted-foreground">{th ? 'กำลังบันทึก…' : 'Saving…'}</span>}</p>
        <div className="flex flex-wrap gap-2">
          {Object.values(DocumentCategory).map(value => {
            const picked = requiredDocs.includes(value);
            return <button type="button" key={value} onClick={() => toggleDoc(value)}
              className={`rounded-full border px-3 py-1 text-xs ${picked ? 'border-primary bg-primary/10 text-primary' : 'border-input text-muted-foreground'}`}>
              {documentCategoryLabel(value, th ? 'th' : 'en')}
            </button>;
          })}
          {requiredDocs.filter(d => !(Object.values(DocumentCategory) as string[]).includes(d)).map(value => (
            <button type="button" key={value} onClick={() => toggleDoc(value)}
              className="rounded-full border border-primary bg-primary/10 px-3 py-1 text-xs text-primary">
              {value} ✕
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Input maxLength={100} value={customDoc} onChange={e => setCustomDoc(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomDoc(); } }}
            placeholder={th ? 'เอกสารอื่นที่ไม่อยู่ในรายการ พิมพ์แล้ว Enter' : 'Other document — type and press Enter'} className="flex-1" />
          <Button type="button" variant="outline" disabled={!customDoc.trim()} onClick={addCustomDoc}>{th ? 'เพิ่ม' : 'Add'}</Button>
        </div>
      </div>}

      {templateKey === CARGO_PLAYBOOK_KEY && <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
        <div>
          <p className="text-sm font-medium">{th ? 'Checklist เอกสาร Cargo ของรุ่นนี้' : 'Cargo document checklist for this version'}</p>
          <p className="text-xs text-muted-foreground">{th ? 'เรื่องใหม่จะ snapshot รายการนี้ เรื่องเดิมจะไม่เปลี่ยนตาม' : 'New matters snapshot this list; existing matters remain unchanged.'}</p>
        </div>
        {cargoRequirements.map((item, index) => <div key={item.code} className="grid gap-2 rounded-lg border bg-background p-3 sm:grid-cols-[2rem_minmax(0,1fr)_auto] sm:items-center">
          <span className="text-xs text-muted-foreground">{index + 1}</span>
          <Input maxLength={300} value={item.label} onChange={e => setCargoRequirements(rows => rows.map((row, i) => i === index ? { ...row, label: e.target.value } : row))} />
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={item.requiredByDefault} onChange={e => setCargoRequirements(rows => rows.map((row, i) => i === index ? { ...row, requiredByDefault: e.target.checked } : row))} />{th ? 'ต้องมีตั้งต้น' : 'Required by default'}</label>
        </div>)}
      </div>}

      <p className="text-sm font-medium">{th ? 'งานประเภทนี้ต้องทำอะไรบ้าง' : 'What this type of work needs done'}</p>
      {steps.map((s, i) => <div key={i} className="space-y-2 rounded-lg border p-3">
        <label className="block text-sm">{i + 1}. {th ? 'ชื่อขั้นตอน' : 'Step name'}<Input required maxLength={200} value={s.title} onChange={e => edit(i, { title: e.target.value })} /></label>
        <div className="grid gap-3 rounded-lg bg-muted/40 p-3 sm:grid-cols-2">
          <label className="block text-sm">{th ? 'ผู้รับผิดชอบหลัก' : 'Primary owner'}
            <select className="mt-1 h-11 w-full rounded-lg border bg-background px-2" value={s.primaryRole ?? ''} onChange={e => edit(i, { primaryRole: (e.target.value || undefined) as FirmRoleStr | undefined })}>
              <option value="">—</option>
              {ROLE_OPTIONS.map(r => <option key={r} value={r}>{ROLE_LABELS[r][th ? 'th' : 'en']}</option>)}
            </select>
          </label>
          <label className="block text-sm">{th ? 'ผู้รับผิดชอบสำรอง' : 'Backup owner'}
            <select className="mt-1 h-11 w-full rounded-lg border bg-background px-2" value={s.secondaryRole ?? ''} onChange={e => edit(i, { secondaryRole: (e.target.value || undefined) as FirmRoleStr | undefined })}>
              <option value="">{th ? 'ไม่มี' : 'None'}</option>
              {ROLE_OPTIONS.map(r => <option key={r} value={r}>{ROLE_LABELS[r][th ? 'th' : 'en']}</option>)}
            </select>
          </label>
        </div>
        <label className="block text-sm">{th ? 'คำแนะนำ (ถ้ามี)' : 'Instructions (optional)'}<textarea maxLength={5000} value={s.instructions} onChange={e => edit(i, { instructions: e.target.value })} className="min-h-16 w-full rounded-lg border bg-background p-2" /></label>
      </div>)}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={steps.length >= 50} onClick={() => setSteps([...steps, { title: '', instructions: '' }])}>{th ? 'เพิ่มขั้นตอน' : 'Add step'}</Button>
        {steps.length > 0 && <Button type="button" variant="ghost" onClick={() => setSteps(steps.slice(0, -1))}>{th ? 'ลบขั้นตอนสุดท้าย' : 'Remove last step'}</Button>}
        <Button disabled={busy || !name.trim() || !steps.length || steps.some(s => !s.title.trim())} onClick={publish}>{th ? 'ตรวจแล้ว เผยแพร่รุ่นนี้' : 'Reviewed — publish this version'}</Button>
        <Button type="button" variant="ghost" onClick={() => setEditing(false)}>{th ? 'ปิด' : 'Close'}</Button>
      </div>
    </div>}
    <Link className="inline-flex min-h-11 items-center text-primary underline" href="/cases">{th ? 'เปิดคดีแล้วระบบจะแนะนำ Playbook ที่ผูกไว้ให้เอง →' : 'Open a case and a linked playbook gets suggested automatically →'}</Link>
  </div>;
}
