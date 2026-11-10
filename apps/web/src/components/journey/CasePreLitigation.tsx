'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, type IntakeItem, type IntakeDocumentRequestItem, type JourneyStep } from '@/lib/api';
import { isPending } from '@/lib/email-intake';
import { ConflictCheckPanel } from '@/components/intake/ConflictCheckPanel';
import { ProposalReview } from '@/components/email-intake/ProposalGroup';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function CasePreLitigation({ token, caseId, intakeId, partyNames, steps, onChanged, onEdit }: { token: string; caseId: string; intakeId?: string | null; partyNames: string[]; steps: JourneyStep[]; onChanged: () => void; onEdit: () => void }) {
  const [intake, setIntake] = useState<IntakeItem | null>(null);
  const [requests, setRequests] = useState<IntakeDocumentRequestItem[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [resolving, setResolving] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [requestedFrom, setRequestedFrom] = useState('');
  const load = useCallback(async () => {
    try {
      const [docs, item] = await Promise.all([
        intakeId ? api.getIntakeDocumentRequests(token, intakeId).then((r) => r.requests) : api.getCaseDocumentRequests(token, caseId),
        intakeId ? api.getIntake(token, intakeId) : Promise.resolve(null),
      ]);
      setRequests(docs); setIntake(item); setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'โหลดรายการก่อนฟ้องไม่สำเร็จ'); }
  }, [token, caseId, intakeId]);
  useEffect(() => { void load(); }, [load]);
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await action(); await load(); onChanged(); }
    catch (e) { setError(e instanceof ApiError ? e.message : 'บันทึกไม่สำเร็จ'); }
    finally { setBusy(false); }
  };
  const pending = (intake?.fieldProposals ?? []).filter((p) => p.field !== 'document' && isPending(p));
  const required = (requests ?? []).filter((r) => r.required);
  const ready = required.filter((r) => !['REQUESTED', 'MISSING'].includes(r.status)).length;
  return <div className="space-y-4">
    {pending.length > 0 && <details open={pending.length <= 4} className="group space-y-2 rounded-lg border p-4"><summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><span>ข้อมูลจาก AI รอยืนยัน {pending.length} รายการ</span><span className="text-sm font-normal text-primary"><span className="group-open:hidden">ตรวจ</span><span className="hidden group-open:inline">ย่อ</span></span></summary><ProposalReview proposals={pending} resolvingId={resolving} onResolve={(id, action, value) => { if (!intakeId) return; setResolving(id); void run(() => api.resolveFieldProposal(token, intakeId, id, { action, overrideValue: value })).finally(() => setResolving(null)); }} /></details>}
    <h3 className="font-semibold">รายการตรวจก่อนฟ้อง</h3>
    {error && <p role="alert" className="text-sm text-destructive">{error} <Button variant="outline" size="sm" onClick={() => void load()}>ลองใหม่</Button></p>}
    {steps.map((step) => <div key={step.key} className="border-t py-3">
      <p className={step.state === 'done' ? 'text-muted-foreground line-through' : 'font-medium'}>{step.state === 'done' ? '✓ ' : '○ '}{step.label}</p>
      {step.state !== 'done' && <div className="mt-3 space-y-3 pl-5">
        {step.key === 'INFO' && <><p className="text-sm text-muted-foreground">{step.summary}</p><Button variant="outline" onClick={onEdit}>แก้ไขข้อมูลคดี</Button></>}
        {step.key === 'CONFLICT' && (intakeId && !intake ? <p className="text-sm text-muted-foreground">กำลังโหลดข้อมูลรับเรื่อง…</p> : <ConflictCheckPanel token={token} intake={intake} caseTarget={{ id: caseId, names: partyNames }} onRecorded={() => { void load(); onChanged(); }} />)}
        {step.key === 'DOCUMENTS' && <><p className="text-sm font-medium">เอกสารจากลูกความ · พร้อม {ready} จาก {required.length}</p>
          {!requests ? <p className="text-sm text-muted-foreground">กำลังโหลดรายการ…</p> : required.length === 0 ? <p className="text-sm text-muted-foreground">ยังไม่มีรายการเอกสารที่จำเป็น</p> : required.map((r) => <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-b py-2 text-sm"><span className="break-words">{r.name} <span className="rounded bg-muted px-2 py-1">{r.status === 'RECEIVED' ? 'ได้รับแล้ว ✓' : r.status === 'NOT_APPLICABLE' ? 'ไม่ใช้' : 'รอลูกความ'}</span></span><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={busy || r.status === 'RECEIVED'} onClick={() => void run(() => intakeId ? api.updateIntakeDocumentRequest(token, intakeId, r.id, { status: 'RECEIVED' }) : api.updateCaseDocumentRequest(token, caseId, r.id, 'RECEIVED'))}>ได้รับแล้ว</Button><Button size="sm" variant="outline" disabled={busy || r.status === 'NOT_APPLICABLE'} onClick={() => void run(() => intakeId ? api.updateIntakeDocumentRequest(token, intakeId, r.id, { status: 'NOT_APPLICABLE' }) : api.updateCaseDocumentRequest(token, caseId, r.id, 'NOT_APPLICABLE'))}>ไม่ใช้</Button></div></div>)}
          {adding ? <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); void run(async () => { if (intakeId) await api.addIntakeDocumentRequests(token, intakeId, [{ name: name.trim() }]); else await api.addCaseDocumentRequest(token, caseId, { name: name.trim(), requestedFrom: requestedFrom.trim() }); setName(''); setRequestedFrom(''); setAdding(false); }); }}><Input aria-label="ชื่อเอกสาร" placeholder="ชื่อเอกสาร" required maxLength={200} value={name} onChange={(e) => setName(e.target.value)} />{!intakeId && <Input aria-label="ขอจาก" placeholder="ขอจาก" required maxLength={200} value={requestedFrom} onChange={(e) => setRequestedFrom(e.target.value)} />}<div className="flex gap-2"><Button disabled={busy || !name.trim() || (!intakeId && !requestedFrom.trim())}>{busy ? 'กำลังบันทึก…' : 'เพิ่มรายการ'}</Button><Button type="button" variant="outline" onClick={() => setAdding(false)}>ยกเลิก</Button></div></form> : <Button variant="outline" onClick={() => setAdding(true)}>+ ขอเอกสารเพิ่ม</Button>}
        </>}
      </div>}
    </div>)}
  </div>;
}
