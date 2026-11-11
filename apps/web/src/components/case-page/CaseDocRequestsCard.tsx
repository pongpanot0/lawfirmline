'use client';

import { useEffect, useState } from 'react';
import { Check, Circle, Mail } from 'lucide-react';
import { api, type IntakeDocumentRequestItem } from '@/lib/api';
import { UndoToast, type UndoAction } from '@/components/ui/UndoToast';
import v2 from './v2.module.css';

/** "เอกสารที่ขอจากลูกความ" side card from scenes tab-docs / act-doc-received. */
export function CaseDocRequestsCard({ token, caseId }: { token: string; caseId: string }) {
  const [items, setItems] = useState<IntakeDocumentRequestItem[]>([]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [undo, setUndo] = useState<UndoAction | null>(null);
  const load = () => api.getCaseDocumentRequests(token, caseId).then((rows) => setItems(rows as IntakeDocumentRequestItem[])).catch(() => setError('โหลดรายการเอกสารที่ขอไม่สำเร็จ'));
  useEffect(() => { void load(); }, [token, caseId]);
  const setStatus = async (item: IntakeDocumentRequestItem, status: string) => {
    setBusy(true); setError('');
    try {
      await api.updateCaseDocumentRequest(token, caseId, item.id, status);
      await load();
      if (status === 'RECEIVED') setUndo({ message: `${item.name} ได้รับแล้ว`, detail: 'ระบบหยุดเตือนลูกความเรื่องเอกสารนี้', undo: async () => { await api.updateCaseDocumentRequest(token, caseId, item.id, item.status); await load(); } });
    } catch { setError('บันทึกไม่สำเร็จ ลองอีกครั้ง'); } finally { setBusy(false); }
  };
  const add = async () => {
    if (!name.trim()) return;
    setBusy(true); setError('');
    try { await api.addCaseDocumentRequest(token, caseId, { name: name.trim(), requestedFrom: 'ลูกความ' }); setName(''); setAdding(false); await load(); }
    catch { setError('ขอเอกสารไม่สำเร็จ ลองอีกครั้ง'); } finally { setBusy(false); }
  };
  return <section className={`${v2.card} p-5 shadow-[0_4px_16px_rgba(20,46,67,.06)]`}>
    <UndoToast action={undo} onDismiss={() => setUndo(null)} />
    <h3 className="text-lg font-bold">เอกสารที่ขอจากลูกความ</h3><p className={v2.hint}>ติ๊ก “ได้รับแล้ว” เมื่อได้เอกสาร ระบบจะหยุดเตือนลูกความ</p>
    {items.length ? <ul className="mt-3 space-y-3 text-sm">{items.filter((item) => item.status !== 'NOT_APPLICABLE').map((item) => <li key={item.id} className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-2">{item.status === 'RECEIVED' ? <Check aria-hidden="true" className="h-[1.1em] w-[1.1em] text-[#227052]" /> : <Circle aria-hidden="true" className="h-[1.1em] w-[1.1em] text-muted-foreground" />}{item.name}</span>
      {item.status === 'RECEIVED' ? <span className="font-semibold text-[#227052]">ได้รับแล้ว</span> : <button type="button" disabled={busy} onClick={() => void setStatus(item, 'RECEIVED')} className={`${v2.btn} ${v2.outline} min-h-0 py-1.5`}>ได้รับแล้ว</button>}
    </li>)}</ul> : <p className={`${v2.hint} mt-3`}>ยังไม่ได้ขอเอกสารจากลูกความ</p>}
    {error && <p role="alert" className={v2.error}>{error}</p>}
    {adding ? <div className="mt-4 space-y-2"><label className="block"><span className={v2.flabel}>ชื่อเอกสารที่ขอ</span><input className={v2.field} value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น ใบรับรองแพทย์" autoFocus /></label><div className="flex gap-2"><button type="button" disabled={busy || !name.trim()} onClick={() => void add()} className={`${v2.btn} ${v2.primary}`}>ขอเอกสาร</button><button type="button" onClick={() => setAdding(false)} className={`${v2.btn} ${v2.ghost}`}>ยกเลิก</button></div></div>
      : <button type="button" onClick={() => setAdding(true)} className={`${v2.btn} ${v2.outline} mt-4 w-full`}><Mail aria-hidden="true" className="h-[1.1em] w-[1.1em]" />ขอเอกสารเพิ่มจากลูกความ</button>}
  </section>;
}
