'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { DocumentCategory } from '@lawfirm/shared';
import { useAuth } from '@/lib/auth';
import { useLocale } from '@/components/landing/LocaleProvider';
import { PlaybookRelease, PlaybookStep, FirmRoleStr, setupRequest } from '@/lib/practice-setup';
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

export default function PlaybooksPage() {
  const { token, user } = useAuth(); const { locale } = useLocale(); const th = locale === 'th';
  const [items, setItems] = useState<PlaybookRelease[]>([]);
  const [caseTypes, setCaseTypes] = useState<CaseTypeItem[]>([]);
  const [caseTypeId, setCaseTypeId] = useState('');
  const [steps, setSteps] = useState<PlaybookStep[]>([]);
  const [requiredDocs, setRequiredDocs] = useState<string[]>([]);
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

  const selectedCaseType = caseTypes.find(t => t.id === caseTypeId);

  const startDraft = (typeId: string) => {
    setCreatingCaseType(false);
    setCaseTypeId(typeId);
    const type = caseTypes.find(t => t.id === typeId);
    setRequiredDocs(type?.requiredDocuments ?? []);
    const existing = items.find(p => p.caseTypeId === typeId);
    setSteps(existing ? structuredClone(existing.steps) : []);
    setNotice(''); setError('');
  };

  const handleCaseTypeSelect = (value: string) => {
    if (value === '__new__') { setCreatingCaseType(true); setCaseTypeId(''); setNewCaseTypeName(''); setNotice(''); setError(''); return; }
    startDraft(value);
  };

  const createCaseType = async () => {
    if (!token || !newCaseTypeName.trim()) return;
    setBusy(true); setError('');
    try {
      const created = await api.createCaseType(token, { name: newCaseTypeName.trim() });
      setCaseTypes(list => [...list, created]);
      setCreatingCaseType(false);
      startDraft(created.id);
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
    if (!token || !caseTypeId || !selectedCaseType || !steps.length) return;
    setBusy(true); setError('');
    try {
      const p = await setupRequest<PlaybookRelease>(token, '/playbooks', { name: selectedCaseType.name, caseTypeId, steps });
      setNotice(`${p.name} v${p.version} · ${th ? 'เผยแพร่แล้ว' : 'Published'}`);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); } finally { setBusy(false); }
  };

  return <div className="mx-auto max-w-4xl space-y-6">
    <header>
      <h1 className="text-2xl font-semibold">Playbooks</h1>
      <p className="mt-1 text-sm text-muted-foreground">{th ? 'วิธีทำงานมาตรฐานต่อประเภทคดี — คดีแบบนี้ต้องทำอะไรบ้าง ใครทำ พนักงานใหม่เปิดมาก็รู้ทันที' : 'The standard way to work each case type — what to do, and who does it.'}</p>
    </header>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {notice && <p role="status">{notice}</p>}

    <section className="space-y-3">
      <h2 className="font-semibold">{th ? 'Playbook ที่มีอยู่' : 'Existing playbooks'}</h2>
      {!items.length && <p className="text-sm text-muted-foreground">{th ? 'ยังไม่มี Playbook เลือกประเภทคดีด้านล่างเพื่อเริ่มสร้าง' : 'No playbooks yet. Pick a case type below to start.'}</p>}
      {items.map(p => <details key={p.id} className="rounded-lg border bg-card p-4">
        <summary className="cursor-pointer font-medium">{p.name} · v{p.version}</summary>
        <ol className="my-3 list-decimal space-y-2 pl-5 text-sm">
          {p.steps.map((s, i) => <li key={i}>{s.title}
            <p className="text-xs text-muted-foreground">
              {[s.primaryRole && ROLE_LABELS[s.primaryRole][th ? 'th' : 'en'], s.secondaryRole && `${th ? 'สำรอง' : 'backup'}: ${ROLE_LABELS[s.secondaryRole][th ? 'th' : 'en']}`].filter(Boolean).join(' · ')}
            </p>
            {s.instructions && <p className="text-xs text-muted-foreground">{s.instructions}</p>}
          </li>)}
        </ol>
        {user?.firmRole === 'OWNER' && p.caseTypeId && <Button variant="outline" onClick={() => startDraft(p.caseTypeId!)}>{th ? 'แก้ไข / ออกรุ่นถัดไป' : 'Edit / draft next version'}</Button>}
      </details>)}
    </section>

    {user?.firmRole === 'OWNER' && <div className="space-y-4 rounded-xl border bg-card p-4 sm:p-6">
      <h2 className="text-lg font-semibold">{th ? 'สร้าง / แก้ไข Playbook' : 'Create / edit a playbook'}</h2>

      <label className="block text-sm">{th ? 'ประเภทคดี (ชื่อ Playbook ใช้ชื่อนี้)' : 'Case type (also the playbook name)'}
        <select className="mt-1 h-11 w-full rounded-lg border bg-background px-2" value={caseTypeId} onChange={e => handleCaseTypeSelect(e.target.value)}>
          <option value="">{th ? '— เลือกประเภทคดี —' : '— Select a case type —'}</option>
          {caseTypes.map(t => <option key={t.id} value={t.id}>{t.name}{items.some(p => p.caseTypeId === t.id) ? ` (${th ? 'มี Playbook แล้ว' : 'has a playbook'})` : ''}</option>)}
          <option value="__new__">{th ? '+ สร้างประเภทคดีใหม่' : '+ Create a new case type'}</option>
        </select>
      </label>

      {creatingCaseType && <div className="flex flex-wrap items-end gap-2 rounded-lg border p-3">
        <label className="block flex-1 min-w-[200px] text-sm">{th ? 'ชื่อประเภทคดีใหม่' : 'New case type name'}
          <Input autoFocus maxLength={100} value={newCaseTypeName} onChange={e => setNewCaseTypeName(e.target.value)} placeholder={th ? 'เช่น คดีล้มละลาย' : 'e.g. Bankruptcy'} />
        </label>
        <Button type="button" disabled={busy || !newCaseTypeName.trim()} onClick={createCaseType}>{th ? 'สร้าง' : 'Create'}</Button>
        <Button type="button" variant="ghost" onClick={() => { setCreatingCaseType(false); setCaseTypeId(''); }}>{th ? 'ยกเลิก' : 'Cancel'}</Button>
      </div>}

      {caseTypeId && <>
        <div className="space-y-2 rounded-lg border p-3">
          <p className="text-sm font-medium">{th ? 'เอกสารที่คดีประเภทนี้ต้องมี' : 'Documents this case type should have'}{docSaving && <span className="ml-2 text-xs font-normal text-muted-foreground">{th ? 'กำลังบันทึก…' : 'Saving…'}</span>}</p>
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
        </div>

        <p className="text-sm font-medium">{th ? 'คดีประเภทนี้ต้องทำอะไรบ้าง' : 'What this case type needs done'}</p>
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
          <Button disabled={busy || !steps.length || steps.some(s => !s.title.trim())} onClick={publish}>{th ? 'ตรวจแล้ว เผยแพร่รุ่นนี้' : 'Reviewed — publish this version'}</Button>
        </div>
      </>}
    </div>}
    <Link className="inline-flex min-h-11 items-center text-primary underline" href="/cases">{th ? 'เปิดคดีแล้วระบบจะแนะนำ Playbook ให้เอง →' : 'Open a case and the playbook gets suggested automatically →'}</Link>
  </div>;
}
