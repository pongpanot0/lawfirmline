'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, OutlookChanges } from '@/lib/api';
import type { ReschedulePreview } from './EventResponsibility';
import { useAuth } from '@/lib/auth';
import { formatDateTime } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/** View-mode banner: Outlook-moved proposals (apply / keep) and "removed in Outlook" restore. */
export function OutlookChangesPanel({ eventId, onChanged }: { eventId: string; onChanged: () => void }) {
  const { token } = useAuth();
  const [data, setData] = useState<OutlookChanges | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState<{ changeId: string; preview: ReschedulePreview; reason: string } | null>(null);

  const load = useCallback(() => {
    if (!token) return Promise.resolve();
    // A failed load just hides the banner.
    return api.getOutlookChanges(token, eventId).then(setData).catch(() => setData(null));
  }, [token, eventId]);
  useEffect(() => { void load(); }, [load]);

  async function run(action: () => Promise<unknown>, reload = false) {
    setBusy(true); setError('');
    try {
      await action();
      setConfirming(null);
      await load();
      if (reload) onChanged();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) { setConfirming(null); setError('ข้อมูลเปลี่ยนแล้ว กรุณาลองใหม่'); await load(); }
      else setError(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด');
    } finally { setBusy(false); }
  }

  if (!token || !data || (data.changes.length === 0 && !data.myCopyRemovedInOutlook)) return null;
  return (
    <div className="mb-3 space-y-2">
      {data.changes.map((c) => (
        <div key={c.id} className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          <p>{c.userName} ย้ายนัดนี้ใน Outlook เป็น <strong>{formatDateTime(c.proposedStartAt)}</strong></p>
          {confirming?.changeId === c.id ? (
            <div className="space-y-2">
              <p>{formatDateTime(confirming.preview.oldAt)} → {formatDateTime(confirming.preview.newAt)}</p>
              {confirming.preview.impacts.length > 0 && (
                <div>
                  <p>กำหนดที่ได้รับผลกระทบ {confirming.preview.impacts.length} รายการ</p>
                  <ul className="list-disc pl-5">
                    {confirming.preview.impacts.map((i) => (
                      <li key={i.id}><strong>{i.title}</strong> {formatDateTime(i.oldAt)} → {formatDateTime(i.newAt)}</li>
                    ))}
                  </ul>
                </div>
              )}
              <label className="block">เหตุผลที่เลื่อน
                <Input value={confirming.reason} maxLength={1000} onChange={(e) => setConfirming({ ...confirming, reason: e.target.value })} />
              </label>
              <div className="flex flex-wrap gap-2">
                <Button type="button" disabled={busy || !confirming.reason.trim()} onClick={() => run(() => api.applyOutlookChange(token, eventId, c.id, { fingerprint: confirming.preview.fingerprint, reason: confirming.reason.trim() }), true)}>ยืนยันใช้เวลาใหม่</Button>
                <Button type="button" variant="outline" disabled={busy} onClick={() => setConfirming(null)}>ยกเลิก</Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" disabled={busy} onClick={() => run(async () => {
                const preview = await api.previewEventReschedule(token, eventId, c.proposedStartAt);
                setConfirming({ changeId: c.id, preview, reason: `ย้ายตามปฏิทิน Outlook ของ ${c.userName}` });
              })}>ใช้เวลาใหม่</Button>
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => run(() => api.keepOutlookChange(token, eventId, c.id))}>คงเวลาเดิม</Button>
            </div>
          )}
        </div>
      ))}
      {data.myCopyRemovedInOutlook && (
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          คุณลบนัดนี้ออกจากปฏิทิน Outlook แล้ว
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => run(() => api.restoreOutlookCopy(token, eventId))}>ใส่กลับลง Outlook</Button>
        </p>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
