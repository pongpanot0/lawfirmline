'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ShieldAlert, ShieldCheck, Search } from 'lucide-react';
import { ConflictCheckRecord, ConflictSearchResult, IntakeItem, api } from '@/lib/api';
import { CONFLICT_RESULT_LABELS } from '@/lib/stage-labels';
import { useLocale } from '@/components/landing/LocaleProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

const SELECT_CLASS = 'h-9 rounded-lg border border-input bg-card px-3 text-sm';

const TONE_CLASS: Record<string, string> = {
  ok: 'bg-emerald-500/10 text-emerald-600',
  warn: 'bg-amber-500/10 text-amber-600',
  bad: 'bg-destructive/10 text-destructive',
};

/**
 * ตรวจผลประโยชน์ขัดกันก่อนรับคดี
 *
 * ระบบค้นชื่อทั่วสำนักงานและเสนอผล แต่คนที่ตัดสินคือทนาย — ผลที่บันทึกคือ
 * คำตัดสินของคน ไม่ใช่ของระบบ. ผลล่าสุดที่ไม่ใช่ "ไม่ขัดกัน" จะกั้นการเปิดคดี
 * ไว้จนกว่าจะมีเหตุผลกำกับ
 */
export function ConflictCheckPanel({
  intake,
  token,
  onRecorded,
}: {
  intake: IntakeItem;
  token: string;
  onRecorded?: () => void;
}) {
  const { locale } = useLocale();
  const th = locale === 'th';

  const suggestedTerms = useMemo(
    () =>
      [intake.clientName, intake.opposingParty, intake.contactName, intake.referralName]
        .map((t) => t?.trim())
        .filter((t): t is string => !!t && t.length >= 3),
    [intake.clientName, intake.opposingParty, intake.contactName, intake.referralName],
  );

  const [terms, setTerms] = useState(suggestedTerms.join(', '));
  const [found, setFound] = useState<ConflictSearchResult | null>(null);
  const [history, setHistory] = useState<ConflictCheckRecord[]>([]);
  const [result, setResult] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadHistory = useCallback(async () => {
    try {
      setHistory(await api.listConflictChecks(token, intake.id));
    } catch {
      /* ประวัติโหลดไม่ได้ไม่ควรทำให้หน้าพัง */
    }
  }, [token, intake.id]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const parsedTerms = terms
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length >= 3);

  async function runSearch() {
    if (!parsedTerms.length) {
      setError(th ? 'ต้องมีคำค้นยาวอย่างน้อย 3 ตัวอักษร' : 'Need a term of at least 3 characters');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await api.conflictSearch(token, parsedTerms);
      setFound(res);
      setResult(res.suggestedResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : th ? 'ค้นไม่สำเร็จ' : 'Search failed');
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!result) return;
    setBusy(true);
    setError('');
    try {
      await api.recordConflictCheck(token, {
        terms: parsedTerms,
        intakeId: intake.id,
        result,
        notes: notes.trim() || undefined,
      });
      setNotes('');
      await loadHistory();
      onRecorded?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : th ? 'บันทึกไม่สำเร็จ' : 'Could not save');
    } finally {
      setBusy(false);
    }
  }

  const latest = history[0];

  return (
    <div className="rounded-xl border bg-card p-4 shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          {latest?.result === 'CLEAR' ? (
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
          ) : (
            <ShieldAlert className="h-4 w-4 text-amber-600" />
          )}
          {th ? 'ตรวจผลประโยชน์ขัดกัน (Conflict check)' : 'Conflict check'}
        </h3>
        {latest ? (
          <span
            className={`rounded-full px-2 py-0.5 text-xs ${TONE_CLASS[CONFLICT_RESULT_LABELS[latest.result]?.tone ?? 'warn']}`}
          >
            {th ? CONFLICT_RESULT_LABELS[latest.result]?.th : CONFLICT_RESULT_LABELS[latest.result]?.en}
            {' · '}
            {new Date(latest.checkedAt).toLocaleDateString(th ? 'th-TH' : 'en-GB')}
          </span>
        ) : (
          <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive">
            {th ? 'ยังไม่ได้ตรวจ' : 'Not checked yet'}
          </span>
        )}
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        {th
          ? 'ค้นชื่อทั่วสำนักงาน: ลูกความ ผู้ติดต่อ คู่กรณีในทุกคดี และเรื่องรับใหม่ทั้งหมด'
          : 'Searches the whole firm: clients, contacts, parties on every case, and every intake.'}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Input
          value={terms}
          onChange={(e) => setTerms(e.target.value)}
          placeholder={th ? 'ชื่อที่จะค้น คั่นด้วย ,' : 'Names to search, comma separated'}
          className="max-w-xl"
        />
        <Button type="button" onClick={runSearch} disabled={busy} className="min-h-9">
          <Search className="mr-1 h-4 w-4" />
          {th ? 'ค้น' : 'Search'}
        </Button>
      </div>

      {found && (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-medium">
            {th ? `พบ ${found.matchCount} รายการ` : `${found.matchCount} match(es)`}
            {' · '}
            {th ? 'ระบบเสนอ: ' : 'Suggested: '}
            {th
              ? CONFLICT_RESULT_LABELS[found.suggestedResult]?.th
              : CONFLICT_RESULT_LABELS[found.suggestedResult]?.en}
          </p>

          {found.matches.length > 0 && (
            <ul className="max-h-56 space-y-1 overflow-y-auto rounded-lg border p-2 text-xs">
              {found.matches.map((m, i) => (
                <li key={`${m.kind}-${i}`} className="flex flex-wrap items-center gap-1.5">
                  <span
                    className={`rounded px-1.5 py-0.5 ${
                      m.side === 'OPPONENT' ? 'bg-destructive/10 text-destructive' : 'bg-muted'
                    }`}
                  >
                    {m.side === 'OPPONENT' ? (th ? 'ฝ่ายตรงข้าม' : 'Opponent') : th ? 'ฝ่ายเรา' : 'Ours'}
                  </span>
                  <span className="font-medium">{m.name}</span>
                  {m.ownRef && (
                    <a className="text-primary underline" href={`/cases/${m.caseId}`}>
                      {m.ownRef}
                    </a>
                  )}
                  {m.intakeId && !m.caseId && (
                    <a className="text-primary underline" href={`/intake/${m.intakeId}`}>
                      {m.intakeTitle || (th ? 'เรื่องรับใหม่' : 'intake')}
                    </a>
                  )}
                  <span className="text-muted-foreground">({m.term})</span>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs">
              <span className="mb-1 block text-muted-foreground">
                {th ? 'คำตัดสินของทนาย' : 'Lawyer decision'}
              </span>
              <select value={result} onChange={(e) => setResult(e.target.value)} className={SELECT_CLASS}>
                {Object.entries(CONFLICT_RESULT_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {th ? label.th : label.en}
                  </option>
                ))}
              </select>
            </label>
            <Button type="button" onClick={save} disabled={busy || !result} className="min-h-9">
              {th ? 'บันทึกผลตรวจ' : 'Record result'}
            </Button>
          </div>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder={th ? 'บันทึกเหตุผล / สิ่งที่ตรวจเพิ่ม' : 'Notes on the decision'}
          />
        </div>
      )}

      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}

      {history.length > 0 && (
        <details className="mt-3 text-xs">
          <summary className="cursor-pointer text-muted-foreground">
            {th ? `ประวัติการตรวจ (${history.length})` : `Check history (${history.length})`}
          </summary>
          <ul className="mt-2 space-y-1">
            {history.map((h) => (
              <li key={h.id} className="flex flex-wrap gap-2">
                <span className={`rounded px-1.5 ${TONE_CLASS[CONFLICT_RESULT_LABELS[h.result]?.tone ?? 'warn']}`}>
                  {th ? CONFLICT_RESULT_LABELS[h.result]?.th : CONFLICT_RESULT_LABELS[h.result]?.en}
                </span>
                <span>{new Date(h.checkedAt).toLocaleString(th ? 'th-TH' : 'en-GB')}</span>
                <span className="text-muted-foreground">
                  {h.checkedBy ? `${h.checkedBy.firstName} ${h.checkedBy.lastName}` : ''}
                  {` · ${h.searchTerms.join(', ')} · ${h.matchCount}`}
                </span>
                {h.notes && <span className="text-muted-foreground">— {h.notes}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
