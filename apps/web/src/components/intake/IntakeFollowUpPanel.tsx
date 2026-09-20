'use client';

import { useCallback, useEffect, useState } from 'react';
import { BellRing, PhoneOff } from 'lucide-react';
import { IntakeFollowUpItem, IntakeItem, UserItem, api } from '@/lib/api';
import { useLocale } from '@/components/landing/LocaleProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

const SELECT_CLASS = 'h-9 rounded-lg border border-input bg-card px-3 text-sm';

/**
 * ติดตาม lead ที่ยังไม่จบ
 *
 * lead หายเพราะไม่มีใครถือ ไม่ใช่เพราะไม่มีใครอยากติดตาม — ทุกครั้งที่บันทึก
 * การติดตาม จึงถามต่อทันทีว่าครั้งถัดไปเมื่อไรและใครถือ
 */
export function IntakeFollowUpPanel({
  intake,
  token,
  lawyers,
  onChanged,
}: {
  intake: IntakeItem;
  token: string;
  lawyers: UserItem[];
  onChanged: () => void;
}) {
  const { locale } = useLocale();
  const th = locale === 'th';
  const [items, setItems] = useState<IntakeFollowUpItem[]>([]);
  const [note, setNote] = useState('');
  const [contacted, setContacted] = useState(true);
  const [nextDueAt, setNextDueAt] = useState('');
  const [nextOwnerId, setNextOwnerId] = useState(intake.followUpOwnerId ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setItems(await api.listIntakeFollowUps(token, intake.id));
    } catch {
      /* ประวัติโหลดไม่ได้ไม่ควรทำให้หน้าพัง */
    }
  }, [token, intake.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const overdue = typeof intake.followUpOverdueDays === 'number' && intake.followUpOverdueDays > 0;

  async function submit() {
    if (!note.trim()) return;
    setBusy(true);
    setError('');
    try {
      await api.addIntakeFollowUp(token, intake.id, {
        note: note.trim(),
        contacted,
        nextDueAt: nextDueAt || undefined,
        nextOwnerId: nextOwnerId || undefined,
      });
      setNote('');
      setNextDueAt('');
      await load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : th ? 'บันทึกไม่สำเร็จ' : 'Could not save');
    } finally {
      setBusy(false);
    }
  }

  async function markNoResponse() {
    setBusy(true);
    setError('');
    try {
      await api.markIntakeNoResponse(token, intake.id, note.trim() || undefined);
      setNote('');
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : th ? 'บันทึกไม่สำเร็จ' : 'Could not save');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border bg-card p-4 shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <BellRing className="h-4 w-4" />
          {th ? 'การติดตาม' : 'Follow-up'}
        </h3>
        <span
          className={`rounded-full px-2 py-0.5 text-xs ${
            overdue ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'
          }`}
        >
          {intake.nextFollowUpAt
            ? overdue
              ? th
                ? `เลยนัดติดตาม ${intake.followUpOverdueDays} วัน`
                : `${intake.followUpOverdueDays}d overdue`
              : th
                ? `นัดติดตาม ${new Date(intake.nextFollowUpAt).toLocaleDateString('th-TH')}`
                : `Due ${new Date(intake.nextFollowUpAt).toLocaleDateString('en-GB')}`
            : th
              ? 'ยังไม่ได้นัดติดตาม'
              : 'No follow-up scheduled'}
        </span>
      </div>

      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        className="mt-3"
        placeholder={th ? 'ติดตามอะไรไป ผลเป็นอย่างไร' : 'What you did, and what came of it'}
      />

      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="flex items-center gap-1.5 text-xs">
          <input type="checkbox" checked={contacted} onChange={(e) => setContacted(e.target.checked)} />
          {th ? 'ติดต่อได้' : 'Reached them'}
        </label>
        <label className="text-xs">
          <span className="mb-1 block text-muted-foreground">{th ? 'ติดตามครั้งถัดไป' : 'Next follow-up'}</span>
          <Input type="date" value={nextDueAt} onChange={(e) => setNextDueAt(e.target.value)} className="w-40" />
        </label>
        <label className="text-xs">
          <span className="mb-1 block text-muted-foreground">{th ? 'ผู้ถือเรื่อง' : 'Owner'}</span>
          <select value={nextOwnerId} onChange={(e) => setNextOwnerId(e.target.value)} className={SELECT_CLASS}>
            <option value="">{th ? 'ไม่ระบุ' : 'Unassigned'}</option>
            {lawyers.map((l) => (
              <option key={l.id} value={l.id}>
                {l.firstName} {l.lastName}
              </option>
            ))}
          </select>
        </label>
        <Button type="button" onClick={submit} disabled={busy || !note.trim()} className="min-h-9">
          {th ? 'บันทึกการติดตาม' : 'Log follow-up'}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={markNoResponse}
          disabled={busy}
          className="min-h-9"
        >
          <PhoneOff className="mr-1 h-4 w-4" />
          {th ? 'ไม่ตอบกลับ' : 'No response'}
        </Button>
      </div>

      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}

      {items.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap gap-2 border-l-2 border-border pl-2">
              <span className="text-muted-foreground">
                {new Date(item.createdAt).toLocaleDateString(th ? 'th-TH' : 'en-GB')}
              </span>
              {!item.contacted && (
                <span className="rounded bg-muted px-1.5">{th ? 'ติดต่อไม่ได้' : 'no contact'}</span>
              )}
              <span>{item.note}</span>
              {item.createdBy && (
                <span className="text-muted-foreground">
                  — {item.createdBy.firstName} {item.createdBy.lastName}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
