'use client';

import { useState } from 'react';
import {
  CASE_NUMBER_HINT,
  CASE_NUMBER_HTML,
  COURT_LEVEL_LABELS,
  CourtLevel,
  JUDGMENT_OUTCOME_LABELS,
  JudgmentOutcome,
  SERVICE_METHOD_LABELS,
  ServiceMethod,
} from '@lawfirm/shared';
import { useAuth } from '@/lib/auth';
import { api, ProceedingActionResult } from '@/lib/api';
import { CaseProceedingItem, judgmentLine, proceedingNumbers, sortProceedings } from '@/lib/proceedings';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ThaiDateInput } from '@/components/ui/ThaiDateInput';

type Action = 'filing' | 'service' | 'judgment' | 'appeal';

const ACTIONS: { id: Action; label: string }[] = [
  { id: 'filing', label: 'บันทึกการยื่นฟ้อง' },
  { id: 'service', label: 'บันทึกการส่งหมาย' },
  { id: 'judgment', label: 'บันทึกคำพิพากษา' },
  { id: 'appeal', label: 'บันทึกการได้รับสำเนาอุทธรณ์' },
];

const SELECT = 'h-9 w-full rounded-md border border-input bg-background px-3 text-sm';
const toIso = (day: string) => new Date(`${day}T00:00:00+07:00`).toISOString();

/** ศาล / เลขคดี: one row per court level, plus the four facts that start procedural clocks. */
export function CaseProceedingsCard({
  caseId,
  proceedings,
  currentLevel,
  onChanged,
}: {
  caseId: string;
  proceedings: CaseProceedingItem[];
  currentLevel: CourtLevel | null;
  onChanged: () => void;
}) {
  const { token } = useAuth();
  const [action, setAction] = useState<Action | null>(null);
  const [date, setDate] = useState('');
  const [number, setNumber] = useState('');
  const [method, setMethod] = useState<ServiceMethod>(ServiceMethod.PERSONAL);
  const [level, setLevel] = useState<CourtLevel>(currentLevel ?? CourtLevel.TRIAL);
  const [outcome, setOutcome] = useState<JudgmentOutcome | ''>('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const open = (next: Action) => {
    if (busy) return;
    setMessage('');
    setAction(action === next ? null : next);
    setDate(''); setNumber(''); setOutcome(''); setAmount(''); setNote(''); setError('');
    setLevel(currentLevel ?? CourtLevel.TRIAL);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !token || !action || !date) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      let result: ProceedingActionResult;
      if (action === 'filing') {
        result = await api.recordFiling(token, caseId, { filedAt: toIso(date), ...(number.trim() ? { blackCaseNumber: number.trim() } : {}) });
      } else if (action === 'service') {
        result = await api.recordService(token, caseId, { servedAt: toIso(date), method });
      } else if (action === 'judgment') {
        if (!outcome) { setError('เลือกผลคำพิพากษา'); return; }
        result = await api.recordJudgment(token, caseId, {
          courtLevel: level, judgmentAt: toIso(date), outcome,
          ...(amount.trim() ? { amount: Number(amount) } : {}),
          ...(number.trim() ? { redCaseNumber: number.trim() } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
        });
      } else {
        result = await api.recordAppealServed(token, caseId, { servedAt: toIso(date) });
      }
      setMessage(
        result.suggestions > 0
          ? `บันทึกแล้ว — เสนอวันครบกำหนด ${result.suggestions} รายการ ตรวจและยืนยันที่แท็บไทม์ไลน์`
          : 'บันทึกแล้ว',
      );
      setAction(null);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  const rows = sortProceedings(proceedings);

  return (
    <Card data-testid="case-proceedings">
      <CardHeader>
        <CardTitle className="text-base">ศาล / เลขคดี</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {rows.length === 0 ? (
          <p className="text-muted-foreground">ยังไม่ได้ยื่นฟ้อง</p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((p) => (
              <li key={p.id} className="py-2">
                <p className="font-medium">
                  {COURT_LEVEL_LABELS[p.courtLevel]}
                  {p.courtName && p.courtName !== COURT_LEVEL_LABELS[p.courtLevel] ? ` · ${p.courtName}` : ''}
                  {p.courtLevel === (currentLevel ?? CourtLevel.TRIAL) && (
                    <span className="ml-2 rounded bg-accent px-1.5 py-0.5 text-xs text-primary">ชั้นปัจจุบัน</span>
                  )}
                </p>
                <p className="text-muted-foreground">{proceedingNumbers(p)}</p>
                {judgmentLine(p) && <p className="text-muted-foreground">{judgmentLine(p)}</p>}
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap gap-2">
          {ACTIONS.map((a) => (
            <Button key={a.id} type="button" size="sm" variant={action === a.id ? 'secondary' : 'outline'} onClick={() => open(a.id)}>
              {a.label}
            </Button>
          ))}
        </div>

        {action && (
          <form onSubmit={submit} className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-muted-foreground">
                {action === 'filing' ? 'วันยื่นฟ้อง' : action === 'service' ? 'วันที่จำเลยได้รับหมาย' : action === 'judgment' ? 'วันอ่านคำพิพากษา' : 'วันได้รับสำเนาอุทธรณ์'}
              </span>
              <ThaiDateInput required value={date} onChange={setDate} />
            </label>
            {action === 'filing' && (
              <label className="block">
                <span className="mb-1 block text-muted-foreground">หมายเลขคดีดำ</span>
                <Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder={CASE_NUMBER_HINT} pattern={CASE_NUMBER_HTML} title={CASE_NUMBER_HINT} />
              </label>
            )}
            {action === 'service' && (
              <label className="block">
                <span className="mb-1 block text-muted-foreground">วิธีส่งหมาย</span>
                <select className={SELECT} value={method} onChange={(e) => setMethod(e.target.value as ServiceMethod)}>
                  {Object.values(ServiceMethod).map((m) => <option key={m} value={m}>{SERVICE_METHOD_LABELS[m]}</option>)}
                </select>
              </label>
            )}
            {action === 'judgment' && (
              <>
                <label className="block">
                  <span className="mb-1 block text-muted-foreground">ศาลที่พิพากษา</span>
                  <select className={SELECT} value={level} onChange={(e) => setLevel(e.target.value as CourtLevel)}>
                    {Object.values(CourtLevel).map((l) => <option key={l} value={l}>{COURT_LEVEL_LABELS[l]}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-muted-foreground">ผลคำพิพากษา</span>
                  <select required className={SELECT} value={outcome} onChange={(e) => setOutcome(e.target.value as JudgmentOutcome)}>
                    <option value="" disabled>เลือกผล</option>
                    {Object.values(JudgmentOutcome).map((o) => <option key={o} value={o}>{JUDGMENT_OUTCOME_LABELS[o]}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-muted-foreground">จำนวนเงินตามคำพิพากษา (บาท)</span>
                  <Input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-muted-foreground">หมายเลขคดีแดง</span>
                  <Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder={CASE_NUMBER_HINT} pattern={CASE_NUMBER_HTML} title={CASE_NUMBER_HINT} />
                </label>
                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-muted-foreground">สรุปคำพิพากษา</span>
                  <textarea className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
                </label>
              </>
            )}
            {error && <p className="text-destructive sm:col-span-2">{error}</p>}
            <div className="sm:col-span-2">
              <Button type="submit" size="sm" disabled={busy || !date}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</Button>
            </div>
          </form>
        )}
        {message && <p role="status" className="text-muted-foreground">{message}</p>}
      </CardContent>
    </Card>
  );
}
