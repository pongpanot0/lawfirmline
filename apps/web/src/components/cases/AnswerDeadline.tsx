'use client';

import { useState } from 'react';
import { api, type AnswerDeadlineItem, type AnswerExtensionItem } from '@/lib/api';
import { bangkokDateInputValue, bangkokDaysBetween } from '@/lib/bangkok';
import { formatDate } from '@/lib/utils';
import { ActionWithHint } from '@/components/ui/ActionWithHint';
import { ThaiDateInput } from '@/components/ui/ThaiDateInput';

const ORDERS = { PENDING: 'รอคำสั่งศาล', GRANTED: 'อนุญาตถึงวันที่', DENIED: 'ไม่อนุญาต' } as const;
type Order = AnswerExtensionItem['status'];
type Editor = { kind: 'base' } | { kind: 'request' } | { kind: 'order'; id: string };

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <div className="min-w-0"><p className="mb-1 text-muted-foreground">{label}</p>
    <ThaiDateInput label={label} required value={value} onChange={onChange} /></div>;
}

export function AnswerDeadline({ deadline, caseId, token, readOnly, onSaved }: {
  deadline: AnswerDeadlineItem; caseId: string; token: string; readOnly: boolean; onSaved: (updated: AnswerDeadlineItem) => void;
}) {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [date, setDate] = useState('');
  const [until, setUntil] = useState('');
  const [grantedUntil, setGrantedUntil] = useState('');
  const [notice, setNotice] = useState('');
  const [order, setOrder] = useState<Order>('PENDING');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const open = (next: Editor, extension?: AnswerExtensionItem) => {
    setError('');
    setNotice('');
    setDate(next.kind === 'base' && deadline.answerDueAt ? bangkokDateInputValue(deadline.answerDueAt) : '');
    setOrder(extension?.status ?? 'PENDING');
    setUntil('');
    setGrantedUntil(extension?.grantedUntil ? bangkokDateInputValue(extension.grantedUntil) : '');
    setEditor(next);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editor || busy || readOnly) return;
    setBusy(true);
    setError('');
    let requestSaved = false;
    const courtOrder = { status: order, ...(order === 'GRANTED' ? { grantedUntil } : {}) };
    try {
      let updated: AnswerDeadlineItem;
      if (editor.kind === 'base') {
        updated = await api.setAnswerDeadline(token, caseId, { answerDueAt: date });
      } else if (editor.kind === 'request') {
        updated = await api.createAnswerExtension(token, caseId, { filedAt: date, requestedUntil: until });
        if (order !== 'PENDING') {
          // The POST returns the whole timeline. Do not guess the ID from the row order.
          const previousIds = new Set(deadline.extensions.map((item) => item.id));
          const matches = updated.extensions.filter((item) => !previousIds.has(item.id)
            && bangkokDateInputValue(item.filedAt) === date && bangkokDateInputValue(item.requestedUntil) === until);
          if (matches.length !== 1) {
            onSaved(updated);
            setEditor(null);
            setNotice('บันทึกคำร้องแล้ว กรุณาเลือกคำร้องที่จะบันทึกคำสั่งศาล');
            return;
          }
          const id = matches[0].id;
          requestSaved = true;
          setEditor({ kind: 'order', id });
          try {
            updated = await api.updateAnswerExtension(token, caseId, id, courtOrder);
          } catch (err) {
            onSaved(updated);
            throw err;
          }
        }
      } else {
        updated = await api.updateAnswerExtension(token, caseId, editor.id, courtOrder);
      }
      setEditor(null);
      onSaved(updated);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'บันทึกกำหนดยื่นคำให้การไม่สำเร็จ';
      setError(requestSaved ? `บันทึกคำร้องแล้ว แต่ยังไม่ได้บันทึกคำสั่งศาล · ${message}` : message);
    } finally {
      setBusy(false);
    }
  };
  const days = deadline.effectiveDueAt ? bangkokDaysBetween(new Date(), deadline.effectiveDueAt) : null;
  const orderComplete = order !== 'GRANTED' || !!grantedUntil;
  const canSave = editor?.kind === 'base' ? !!date : orderComplete && (editor?.kind === 'order' || (!!date && !!until));
  const form = editor && !readOnly && (
    <form onSubmit={submit} className="space-y-3 rounded-lg border p-3">
      <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
        {editor.kind === 'base' && <DateField label="กำหนดยื่นคำให้การตามกฎหมาย" value={date} onChange={setDate} />}
        {editor.kind === 'request' && <>
          <DateField label="วันที่ยื่นคำร้อง" value={date} onChange={setDate} />
          <DateField label="ขอขยายถึง" value={until} onChange={setUntil} />
        </>}
        {editor.kind !== 'base' && <fieldset className="space-y-2 sm:col-span-2">
          <legend className="font-semibold">คำสั่งศาล</legend>
          {(Object.keys(ORDERS) as Order[]).map((value) => (
            <div key={value}>
              <label className="flex items-center gap-2"><input type="radio" name="court-order" checked={order === value} onChange={() => setOrder(value)} />{ORDERS[value]}</label>
              {order === 'GRANTED' && value === order && <DateField label="วันที่ศาลอนุญาต" value={grantedUntil} onChange={setGrantedUntil} />}
            </div>
          ))}
        </fieldset>}
      </fieldset>
      {error && <p role="alert" className="text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-3">
        <ActionWithHint type="submit" disabled={busy || !canSave} hint={editor.kind === 'request' ? 'เก็บคำร้องและคำสั่งศาล' : 'ปรับกำหนดและวันเตือน'}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</ActionWithHint>
        <ActionWithHint variant="outline" disabled={busy} hint="ปิดโดยไม่บันทึก" onClick={() => setEditor(null)}>ยกเลิก</ActionWithHint>
      </div>
    </form>
  );
  return (
    <div className="space-y-4">
      {notice && <p role="status" className="text-muted-foreground">{notice}</p>}
      <ol className="ml-2 border-l border-border">
        <li className="relative space-y-1 pb-4 pl-4 before:absolute before:-left-1 before:top-1.5 before:size-2 before:rounded-full before:bg-primary">
          <p className="font-semibold">ตามกฎหมาย · {deadline.answerDueAt ? formatDate(deadline.answerDueAt) : 'ยังไม่ได้ระบุกำหนด'}</p>
          {!readOnly && <ActionWithHint variant="link" className="px-0" disabled={busy} hint="ระบุวันที่ตามสำนวนคดี" onClick={() => open({ kind: 'base' })}>
            {deadline.answerDueAt ? 'แก้ไขกำหนดตามกฎหมาย' : 'ตั้งกำหนดตามกฎหมาย'}
          </ActionWithHint>}
          {editor?.kind === 'base' && form}
        </li>
        {deadline.extensions.map((item, index) => (
          <li key={item.id} className="relative space-y-1 pb-4 pl-4 before:absolute before:-left-1 before:top-1.5 before:size-2 before:rounded-full before:border before:border-primary before:bg-card">
            <h4 className="font-semibold">ขอขยายครั้งที่ {index + 1}</h4>
            <p>ยื่นคำร้อง {formatDate(item.filedAt)} · ขอขยายถึง {formatDate(item.requestedUntil)}</p>
            <span className={`inline-block whitespace-nowrap rounded px-2 py-0.5 text-xs ${item.status === 'PENDING' ? 'bg-amber-50 text-amber-900' : 'bg-muted'}`}>
              {item.status === 'GRANTED' && item.grantedUntil ? `ศาลอนุญาตถึง ${formatDate(item.grantedUntil)}` : ORDERS[item.status]}
            </span>
            {!readOnly && <ActionWithHint variant="outline" disabled={busy} hint={`ใช้กับคำร้องครั้งที่ ${index + 1}`} onClick={() => open({ kind: 'order', id: item.id }, item)}>
              {item.status === 'PENDING' ? 'บันทึกคำสั่งศาล' : 'แก้ไขคำสั่งศาล'}
            </ActionWithHint>}
            {editor?.kind === 'order' && editor.id === item.id && form}
          </li>
        ))}
      </ol>
      {deadline.effectiveDueAt && <div className="space-y-1 rounded-md bg-accent p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <strong className="text-lg">ยื่นได้ถึง {formatDate(deadline.effectiveDueAt)}</strong>
          {days !== null && <span className="whitespace-nowrap rounded border bg-card px-2 text-xs">{days < 0 ? `เลยกำหนด ${-days} วัน` : days === 0 ? 'ครบกำหนดวันนี้' : `อีก ${days} วัน`}</span>}
        </div>
        {deadline.fileBy && <p className="text-destructive">ควรยื่นไม่เกิน {formatDate(deadline.fileBy)} (ก่อนครบกำหนด 1 วัน)</p>}
      </div>}
      {!readOnly && <ActionWithHint variant="outline" disabled={busy} hint="ระบุวันยื่นคำร้องและวันที่ขอขยายถึง" onClick={() => open({ kind: 'request' })}>บันทึกการขอขยาย</ActionWithHint>}
      {editor?.kind === 'request' && form}
      {deadline.extensions.length > 0 && <p className="text-xs text-muted-foreground">ถ้าศาลไม่อนุญาตให้ขยายเวลา ให้ยื่นตามกำหนดเดิม</p>}
    </div>
  );
}
