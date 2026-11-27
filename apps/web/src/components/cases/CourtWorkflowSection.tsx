'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { ActionWithHint } from '@/components/ui/ActionWithHint';
import { AnswerDeadline } from './AnswerDeadline';
import { CourtFollowUps } from './CourtFollowUps';

function useCourtRecord<T>(load: (token: string, caseId: string) => Promise<T>, token: string, caseId: string, enabled: boolean) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setError('');
    load(token, caseId).then((result) => {
      if (active) setData(result);
    }).catch((err) => {
      if (active) setError(err instanceof Error ? err.message : 'โหลดข้อมูลจากศาลไม่สำเร็จ');
    });
    return () => { active = false; };
  }, [load, token, caseId, enabled, attempt]);
  return { data, setData, error, retry: () => setAttempt((n) => n + 1) };
}

export function CourtWorkflowSection({ token, caseId, defendant, filedAt, readOnly, refreshBoth, onChanged, onService }: {
  token: string; caseId: string; defendant: boolean; filedAt: string | null; readOnly: boolean; refreshBoth: boolean;
  onChanged: () => void; onService: () => void;
}) {
  const calls = useCourtRecord(api.getCourtFollowUps, token, caseId, !defendant || refreshBoth);
  const deadline = useCourtRecord(api.getAnswerDeadline, token, caseId, defendant || refreshBoth);
  const displayed = defendant ? deadline : calls;

  return (
    <section className="space-y-3 border-t pt-4">
      <h3 className="font-semibold">{defendant ? 'กำหนดยื่นคำให้การ' : 'ติดตามหลังยื่นฟ้อง'}</h3>
      {displayed.error ? <>
        <p role="alert" className="text-destructive">{displayed.error}</p>
        <ActionWithHint variant="outline" hint="โหลดข้อมูลศาลอีกครั้ง" onClick={displayed.retry}>ลองอีกครั้ง</ActionWithHint>
      </> : displayed.data === null ? <p role="status" className="text-muted-foreground">กำลังโหลด…</p> : defendant && deadline.data ? (
        <AnswerDeadline token={token} caseId={caseId} deadline={deadline.data} readOnly={readOnly}
          onSaved={(updated) => { deadline.setData(updated); onChanged(); }} />
      ) : calls.data && (
        <CourtFollowUps token={token} caseId={caseId} rows={calls.data} filedAt={filedAt} readOnly={readOnly} onService={onService}
          onSaved={(updated) => {
            calls.setData((rows) => rows?.map((row) => row.kind === updated.kind ? updated : row) ?? null);
            onChanged();
          }} />
      )}
    </section>
  );
}
