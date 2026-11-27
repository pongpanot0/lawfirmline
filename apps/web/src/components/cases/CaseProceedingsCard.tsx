'use client';

import { useRef, useState } from 'react';
import {
  answerDaysFor,
  answerDueDate,
  PartyRole,
  PARTY_ROLE_LABELS,
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
import { ActionWithHint } from '@/components/ui/ActionWithHint';
import { CourtWorkflowSection } from './CourtWorkflowSection';
import { formatDate } from '@/lib/utils';
import { bangkokDateInputToIso as toIso } from '@/lib/bangkok';
import { Input } from '@/components/ui/input';
import { ThaiDateInput } from '@/components/ui/ThaiDateInput';
import { InlineEmptyState } from '@/components/ui/misc';
import { Select } from '@/components/ui/select';

type Action = 'filing' | 'service' | 'judgment' | 'appeal';

const ACTIONS: { id: Action; label: string; hint: string }[] = [
  { id: 'filing', label: 'บันทึกการยื่นฟ้อง', hint: 'ระบุวันฟ้องและเลขคดีดำ' },
  { id: 'service', label: 'บันทึกการส่งหมาย', hint: 'ระบุวันและวิธีส่งหมาย' },
  { id: 'judgment', label: 'บันทึกคำพิพากษา', hint: 'ระบุผลคำพิพากษา' },
  { id: 'appeal', label: 'บันทึกการได้รับสำเนาอุทธรณ์', hint: 'ระบุวันที่ได้รับสำเนา' },
];

const SELECT = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm';

/** ศาล / เลขคดี: one row per court level, plus the four facts that start procedural clocks. */
export function CaseProceedingsCard({
  caseId,
  proceedings,
  currentLevel,
  partyRole,
  readOnly,
  onChanged,
}: {
  caseId: string;
  proceedings: CaseProceedingItem[];
  currentLevel: CourtLevel | null;
  partyRole: PartyRole | null;
  readOnly: boolean;
  onChanged: () => void;
}) {
  const { token } = useAuth();
  const [workflowVersion, setWorkflowVersion] = useState(0);
  const defendant = partyRole === PartyRole.DEFENDANT || partyRole === PartyRole.RESPONDENT;
  const actionForm = useRef<HTMLFormElement>(null);
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

  const open = (next: Action, forceOpen = false) => {
    if (busy) return;
    setMessage('');
    setAction(action === next && !forceOpen ? null : next);
    setMethod(ServiceMethod.PERSONAL);
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
      if (action === 'filing' || action === 'service') setWorkflowVersion((value) => value + 1);
      setMessage(
        result.suggestions > 0
          ? `บันทึกแล้ว — เสนอวันครบกำหนด ${result.suggestions} รายการ ตรวจและยืนยันที่แท็บไทม์ไลน์`
          : 'บันทึกแล้ว',
      );
      setAction(null);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง');
    } finally {
      setBusy(false);
    }
  };

  const rows = sortProceedings(proceedings);
  const trialFiledAt = rows.find((row) => row.courtLevel === CourtLevel.TRIAL)?.filedAt ?? null;

  return (
    <Card data-testid="case-proceedings">
      <CardHeader>
        <CardTitle className="text-base">ศาล / เลขคดี</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {rows.length === 0 ? (
          <InlineEmptyState title="ยังไม่ได้ยื่นฟ้อง" />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((p) => (
              <li key={p.id} className="py-2">
                <p className="font-medium">
                  {COURT_LEVEL_LABELS[p.courtLevel]}
                  {p.courtName && p.courtName !== COURT_LEVEL_LABELS[p.courtLevel] ? ` · ${p.courtName}` : ''}
                  {p.courtLevel === (currentLevel ?? CourtLevel.TRIAL) && (
                    <span className="ml-2 whitespace-nowrap rounded bg-accent px-1.5 py-0.5 text-xs text-primary">ชั้นปัจจุบัน</span>
                  )}
                </p>
                <p className="text-muted-foreground">{proceedingNumbers(p)}</p>
                <p className="text-muted-foreground">{[p.filedAt && `วันยื่นฟ้อง ${formatDate(p.filedAt)}`, partyRole && `ทนาย${PARTY_ROLE_LABELS[partyRole]}`].filter(Boolean).join(' · ')}</p>
                {judgmentLine(p) && <p className="text-muted-foreground">{judgmentLine(p)}</p>}
              </li>
            ))}
          </ul>
        )}

        {!readOnly && <div className="flex flex-wrap gap-2">
          {ACTIONS.map((a) => (
            <ActionWithHint key={a.id} hint={a.hint} aria-expanded={action === a.id} disabled={busy} type="button" size="sm" variant={action === a.id ? 'secondary' : 'outline'} onClick={() => open(a.id)}>
              {a.label}
            </ActionWithHint>
          ))}
        </div>}

        {action && !readOnly && (
          <form ref={actionForm} onSubmit={submit} className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-2">
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
                <Select className={SELECT} value={method} onChange={(e) => setMethod(e.target.value as ServiceMethod)}>
                  {Object.values(ServiceMethod).map((m) => <option key={m} value={m}>{SERVICE_METHOD_LABELS[m]}</option>)}
                </Select>
              </label>
            )}
            {action === 'service' && date && <p aria-live="polite" className="rounded-md bg-muted/50 p-3 sm:col-span-2">
              จำเลยต้องยื่นคำให้การภายใน {answerDaysFor(method)} วันนับแต่{method === ServiceMethod.PERSONAL ? 'รับหมาย' : 'ปิดหมาย'} · <strong>ครบ {formatDate(answerDueDate(new Date(toIso(date)), method))}</strong>
            </p>}
            {action === 'judgment' && (
              <>
                <label className="block">
                  <span className="mb-1 block text-muted-foreground">ศาลที่พิพากษา</span>
                  <Select className={SELECT} value={level} onChange={(e) => setLevel(e.target.value as CourtLevel)}>
                    {Object.values(CourtLevel).map((l) => <option key={l} value={l}>{COURT_LEVEL_LABELS[l]}</option>)}
                  </Select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-muted-foreground">ผลคำพิพากษา</span>
                  <Select required className={SELECT} value={outcome} onChange={(e) => setOutcome(e.target.value as JudgmentOutcome)}>
                    <option value="" disabled>เลือกผล</option>
                    {Object.values(JudgmentOutcome).map((o) => <option key={o} value={o}>{JUDGMENT_OUTCOME_LABELS[o]}</option>)}
                  </Select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-muted-foreground">จำนวนเงินตามคำพิพากษา (บาท)</span>
                  <Input type="number" min={0} step="0.01" className="text-right tabular-nums" value={amount} onChange={(e) => setAmount(e.target.value)} />
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
            {error && <p role="alert" className="text-destructive sm:col-span-2">{error}</p>}
            <div className="sm:col-span-2">
              <ActionWithHint type="submit" hint={action === 'service' ? 'เก็บการส่งหมายและตั้งวันเตือน' : 'เก็บข้อมูลในสำนวนคดี'} disabled={busy || !date}>{busy ? 'กำลังบันทึก…' : ACTIONS.find((a) => a.id === action)?.label ?? 'บันทึก'}</ActionWithHint>
            </div>
          </form>
        )}
        {message && <p role="status" className="text-muted-foreground">{message}</p>}
        {token && (defendant || !currentLevel || currentLevel === CourtLevel.TRIAL) && (
          <CourtWorkflowSection key={`${caseId}-${defendant}-${workflowVersion}`} token={token} caseId={caseId}
            defendant={defendant} filedAt={trialFiledAt} readOnly={readOnly} refreshBoth={workflowVersion > 0} onChanged={onChanged}
            onService={() => {
              open('service', true);
              requestAnimationFrame(() => actionForm.current?.querySelector('input')?.focus());
            }} />
        )}
      </CardContent>
    </Card>
  );
}
