'use client';

import { useState } from 'react';
import { Check, Circle, CircleDot } from 'lucide-react';
import { COURT_FOLLOW_UP_LABELS } from '@lawfirm/shared';
import { api, type CourtFollowUpItem } from '@/lib/api';
import { bangkokDaysBetween } from '@/lib/bangkok';
import { formatDate } from '@/lib/utils';
import { ActionWithHint } from '@/components/ui/ActionWithHint';
import { Input } from '@/components/ui/input';

type Kind = CourtFollowUpItem['kind'];

export function CourtFollowUps({ rows, token, caseId, filedAt, readOnly, onSaved, onService }: {
  rows: CourtFollowUpItem[]; token: string; caseId: string; filedAt: string | null; readOnly: boolean;
  onSaved: (row: CourtFollowUpItem) => void; onService: () => void;
}) {
  const [editing, setEditing] = useState<Kind | null>(null);
  const [result, setResult] = useState('');
  const [done, setDone] = useState(false);
  const [retry, setRetry] = useState('7');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const firstOpen = rows.find((row) => !row.doneAt)?.kind;

  const open = (kind: Kind) => {
    setEditing(editing === kind ? null : kind);
    setResult('');
    setDone(false);
    setRetry('7');
    setError('');
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editing || busy || readOnly) return;
    // Served: the service record itself closes this item and starts the answer clock,
    // so closing it here first would lose both if the lawyer leaves the service form.
    if (editing === 'SERVICE' && done) {
      setEditing(null);
      onService();
      return;
    }
    if (!result.trim()) return;
    setBusy(true);
    setError('');
    try {
      const row = await api.recordCourtFollowUp(token, caseId, editing, {
        result: result.trim(), done, ...(done ? {} : { retryInDays: Number(retry) }),
      });
      setEditing(null);
      onSaved(row);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'บันทึกผลการโทรไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  if (!rows.length) return <p className="text-muted-foreground">ยังไม่มีรายการติดตาม ระบบจะตั้งวันติดตามเมื่อบันทึกการยื่นฟ้องหรือการส่งหมาย</p>;
  return (
    <ol className="divide-y border-t">
      {rows.map((row) => {
        const service = row.kind === 'SERVICE';
        const daysAfterFiling = filedAt && row.kind !== 'ANSWER' ? bangkokDaysBetween(filedAt, row.dueAt) : null;
        const Mark = row.doneAt ? Check : row.kind === firstOpen ? CircleDot : Circle;
        return (
          <li key={row.kind} className="relative space-y-1 py-3 pl-7">
            <Mark aria-hidden="true" className={`absolute left-0 top-4 size-4 ${row.doneAt ? 'rounded-full bg-success p-0.5 text-white' : 'text-muted-foreground'}`} />
            <h4 className="font-semibold">{COURT_FOLLOW_UP_LABELS[row.kind]}</h4>
            <p className="text-xs text-muted-foreground">ภายใน {formatDate(row.dueAt)}
              {daysAfterFiling !== null && daysAfterFiling >= 0 && ` (${daysAfterFiling} วันหลังยื่นฟ้อง)`}
            </p>
            {row.lastResult && <p className="whitespace-pre-wrap break-words">{row.lastResult}</p>}
            {row.doneAt && <p className="text-xs text-success">ติดตามเสร็จแล้ว · {formatDate(row.doneAt)}</p>}
            {!row.doneAt && !readOnly && (
              <ActionWithHint variant="outline" aria-expanded={editing === row.kind} disabled={busy}
                hint={service ? 'ถ้ายังส่งไม่ได้ เตือนให้ถามซ้ำใน 7 วัน' : 'บันทึกผล หรือตั้งวันโทรซ้ำ'} onClick={() => open(row.kind)}>บันทึกผลการโทร</ActionWithHint>
            )}
            {editing === row.kind && !readOnly && (
              <form onSubmit={submit} className="mt-2 space-y-3 rounded-md bg-muted/50 p-3">
                <fieldset disabled={busy} className="space-y-3">
                  <label className="block">ผลการโทร
                    <textarea required={!(service && done)} rows={2} maxLength={2000} value={result} onChange={(e) => setResult(e.target.value)}
                      className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2" />
                  </label>
                  <fieldset className="space-y-1">
                    <legend className="font-medium">ผลลัพธ์</legend>
                    <label className="flex items-center gap-2"><input type="radio" name="call-result" checked={done} onChange={() => setDone(true)} />
                      {service ? 'ส่งหมายได้แล้ว ไปบันทึกการส่งหมาย' : 'ติดตามเสร็จแล้ว'}
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="flex items-center gap-2"><input type="radio" name="call-result" checked={!done} onChange={() => setDone(false)} />
                        {service ? 'ยังส่งไม่ได้ ถามซ้ำใน' : 'ถามซ้ำใน'}
                      </label>
                      <Input type="number" min={1} max={60} step={1} required={!done} disabled={done} aria-label="จำนวนวันก่อนถามซ้ำ"
                        className="w-16" value={retry} onChange={(e) => setRetry(e.target.value)} /> วัน
                    </div>
                  </fieldset>
                </fieldset>
                {error && <p role="alert" className="text-destructive">{error}</p>}
                {service && done ? (
                  <ActionWithHint type="submit" hint="รายการนี้ปิดเองเมื่อบันทึกการส่งหมาย">ไปบันทึกการส่งหมาย</ActionWithHint>
                ) : (
                  <ActionWithHint type="submit" disabled={busy || !result.trim()} hint={done ? 'เก็บผลและปิดรายการติดตาม' : 'เก็บผลและตั้งวันติดตาม'}>
                    {busy ? 'กำลังบันทึก…' : 'บันทึก'}
                  </ActionWithHint>
                )}
              </form>
            )}
          </li>
        );
      })}
      {!rows.some((row) => row.kind === 'ANSWER') && (
        <li className="relative py-3 pl-7 text-muted-foreground">
          <Circle aria-hidden="true" className="absolute left-0 top-4 size-4" />
          <h4 className="font-semibold">{COURT_FOLLOW_UP_LABELS.ANSWER}</h4>
          <p className="text-xs">เริ่มนับเมื่อบันทึกการส่งหมาย</p>
        </li>
      )}
    </ol>
  );
}
