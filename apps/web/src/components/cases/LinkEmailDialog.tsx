'use client';

import { useEffect, useRef, useState } from 'react';
import { api, type LinkCandidate } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { EmailLinkCandidates } from './EmailLinkCandidates';

export function LinkEmailDialog({ token, caseId, caseRef, onClose, onLinked }: { token: string; caseId: string; caseRef: string; onClose: () => void; onLinked: () => Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [selected, setSelected] = useState<LinkCandidate[]>([]);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [failures, setFailures] = useState<string[]>([]);
  useEffect(() => { dialog.current?.showModal(); }, []);
  const link = async () => {
    setBusy(true); setFailures([]);
    const failed: LinkCandidate[] = [];
    for (const row of selected) { try { await api.linkThreadToCase(token, row.threadId, caseId); } catch { failed.push(row); } }
    await onLinked();
    setSelected(failed); setRevision((n) => n + 1); setFailures(failed.map((row) => row.subject)); setBusy(false);
    if (!failed.length) dialog.current?.close();
  };
  return <dialog ref={dialog} onClose={onClose} onCancel={(e) => { if (busy) e.preventDefault(); }} aria-labelledby="link-email-title" className="m-auto max-h-[90dvh] w-[min(42rem,calc(100vw-2rem))] rounded-lg border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/50">
    <div className="flex items-start justify-between gap-4 border-b p-4"><div><h2 id="link-email-title" className="text-lg font-semibold">ผูกอีเมลเข้าคดี · {caseRef}</h2><p className="mt-1 text-sm text-muted-foreground">เลือกอีเมลที่เป็นเรื่องเดียวกัน — ไฟล์แนบจะเข้าแท็บเอกสารของคดีนี้ · แสดงเฉพาะอีเมลในกล่องของคุณ</p></div><Button type="button" variant="ghost" disabled={busy} aria-label="ปิด" onClick={() => dialog.current?.close()}>✕</Button></div>
    <div className="max-h-[55dvh] overflow-y-auto p-4"><EmailLinkCandidates key={revision} token={token} caseId={caseId} selected={selected} onChange={setSelected} disabled={busy} />{failures.length > 0 && <div role="alert" className="mt-3 text-sm text-destructive">ผูกไม่สำเร็จ: {failures.join(' · ')}</div>}</div>
    <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-2 border-t bg-card p-4"><p className="text-sm">เลือก {selected.length} อีเมล · ไฟล์แนบ {selected.reduce((sum, row) => sum + row.attachmentCount, 0)} ไฟล์จะเข้าแท็บเอกสาร</p><div className="flex gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => dialog.current?.close()}>ยกเลิก</Button><Button type="button" disabled={busy || !selected.length} onClick={link}>{busy ? 'กำลังผูก…' : `ผูก ${selected.length} อีเมล`}</Button></div></div>
  </dialog>;
}
