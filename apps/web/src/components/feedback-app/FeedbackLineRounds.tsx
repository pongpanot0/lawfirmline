'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, type FeedbackRounds } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/misc';
import { formatDate } from '@/lib/utils';
import { publishActionFeedback } from '@/lib/action-feedback';
import { State, Scores } from './FeedbackShared';
import { RecipientPicker } from './RecipientPicker';
import { Send, Users } from 'lucide-react';

export function FeedbackLineRounds({ token }: { token: string }) {
  const [data, setData] = useState<FeedbackRounds | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [pending, setPending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const next = await api.getFeedbackLineRounds(token);
      setData(next);
      // Every fresh load starts with everyone ticked, so an untouched page still surveys everyone.
      setSelected(new Set(next.recipients.people.map((person) => person.id)));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [token]);
  useEffect(() => {
    void load();
  }, [load]);
  async function send() {
    if (pending) return;
    setPending(true);
    setSendError('');
    try {
      const result = await api.sendFeedbackLineRound(token, [...selected]);
      // A round is recorded even when LINE refuses some pushes; say how many actually went out.
      publishActionFeedback(
        result.delivered === result.recipientCount ? 'success' : 'error',
        `ส่งถึง LINE แล้ว ${result.delivered} จาก ${result.recipientCount} คน`,
      );
      setConfirm(false);
      await load();
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'ส่งแบบสอบถามไม่สำเร็จ');
    } finally {
      setPending(false);
    }
  }
  return (
    <section>
      <h1 className="text-2xl font-semibold">แบบสอบถามทาง LINE</h1>
      <p className="mb-5 text-sm text-muted-foreground">
        ส่งคำถาม การใช้งาน Samnuan ช่วงนี้เป็นยังไงบ้าง
        ให้พนักงานที่เชื่อม LINE แล้ว
      </p>
      <State loading={loading} error={error} retry={() => void load()} empty={!data}>
        {data && (
          <>
            <div className="grid gap-5 rounded-xl border border-border bg-card p-6 md:grid-cols-2">
              <div>
                <h2 className="mb-3 font-semibold">ตัวอย่างข้อความใน LINE</h2>
                <div className="rounded-lg bg-muted p-4">
                  <strong>Samnuan</strong>
                  <p className="my-4 rounded-lg bg-card p-3">
                    การใช้งาน Samnuan ช่วงนี้เป็นยังไงบ้างครับ?
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {['😞 ใช้ยาก', '😐 พอใช้', '😊 ใช้ง่าย'].map((label) => (
                      <span
                        key={label}
                        className="rounded-full border border-border bg-card px-3 py-1 text-sm"
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div>
                <p className="text-muted-foreground">ผู้รับรอบนี้</p>
                <p className="text-4xl font-semibold">{data.recipients.users} คน</p>
                <p className="my-3 text-sm text-muted-foreground">
                  พนักงานที่เชื่อม LINE แล้ว จาก {data.recipients.firms} สำนักงาน
                  · ไม่รวมลูกความ
                </p>
                <RecipientPicker people={data.recipients.people} selected={selected} onChange={setSelected} />
                <Button onClick={() => setConfirm(true)} disabled={!selected.size}>
                  <Send className="mr-2 h-4 w-4" /> ส่งแบบสอบถามให้ {selected.size} คน
                </Button>
                <p className="mt-2 text-sm text-muted-foreground">จะถามยืนยันอีกครั้งก่อนส่ง</p>
                {data.lastSentAt && (
                  <p className="mt-3 text-sm text-muted-foreground">
                    รอบล่าสุดส่งเมื่อ {formatDate(data.lastSentAt)}
                  </p>
                )}
              </div>
            </div>
            <div className="mt-6 rounded-xl border border-border bg-card">
              <div className="p-5">
                <h2 className="font-semibold">ผลแต่ละรอบ</h2>
                <p className="text-sm text-muted-foreground">
                  ประวัติการส่งแบบสอบถามผ่าน LINE และอัตราการตอบกลับ
                </p>
              </div>
              {!data.rounds.length ? (
                <EmptyState title="ยังไม่มีรอบแบบสอบถาม" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-muted">
                      <tr>
                        {[
                          'วันที่ส่ง', 'ส่งถึง', 'ตอบ (จำนวนและเปอร์เซ็นต์)',
                          'สัดส่วนคะแนน', 'ความเห็น',
                        ].map(
                          (x) => (
                            <th key={x} className="p-3">
                              {x}
                            </th>
                          ),
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {data.rounds.map((r) => (
                        <tr key={r.id} className="border-t border-border">
                          <td className="p-3">{formatDate(r.sentAt)}</td>
                          <td className="p-3">{r.recipientCount} คน</td>
                          <td className="p-3">
                            ตอบ {r.answered} คน (
                            {r.recipientCount ? Math.round((r.answered / r.recipientCount) * 100) : 0}%)
                          </td>
                          <td className="p-3">
                            <Scores {...r} />
                          </td>
                          <td className="p-3">{r.comments} ความเห็น</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            {confirm && (
              <ConfirmRound
                count={selected.size}
                firms={
                  new Set(data.recipients.people.filter((person) => selected.has(person.id)).map((person) => person.firm))
                    .size
                }
                pending={pending}
                error={sendError}
                onClose={() => setConfirm(false)}
                onSend={send}
              />
            )}
          </>
        )}
      </State>
    </section>
  );
}
function ConfirmRound({
  count,
  firms,
  pending,
  error,
  onClose,
  onSend,
}: {
  count: number;
  firms: number;
  pending: boolean;
  error: string;
  onClose: () => void;
  onSend: () => void;
}) {
  const [dialog, setDialog] = useState<HTMLDialogElement | null>(null);
  useEffect(() => {
    dialog?.showModal();
    return () => dialog?.close();
  }, [dialog]);
  return (
    <dialog
      ref={setDialog}
      onCancel={(e) => {
        if (pending) e.preventDefault();
        else onClose();
      }}
      className="w-[calc(100%-2rem)] max-w-md rounded-xl border border-border bg-card p-6 text-foreground shadow-xl backdrop:bg-black/40"
    >
      <Send className="mb-4 h-6 w-6 text-primary" />
      <h2 className="text-xl font-semibold">ส่งแบบสอบถามให้ {count} คน?</h2>
      <p className="mt-2 text-muted-foreground">
        ข้อความจะไปถึง LINE ของพนักงานทันที และยกเลิกไม่ได้
      </p>
      <p className="my-5 rounded-lg bg-muted p-3">
        <Users className="mr-2 inline h-4 w-4" /> พนักงาน {count} คน จาก {firms} สำนักงานกฎหมาย
      </p>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="outline" disabled={pending} onClick={onClose}>
          ยกเลิก
        </Button>
        <Button disabled={pending} onClick={onSend}>
          <Send className="mr-2 h-4 w-4" /> ส่งเลย
        </Button>
      </div>
    </dialog>
  );
}
