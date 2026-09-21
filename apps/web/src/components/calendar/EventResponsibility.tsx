'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useLocale } from '@/components/landing/LocaleProvider';
import { bangkokInputToIso, bangkokInputValue } from '@/lib/bangkok';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ThaiDateTimeInput } from '@/components/ui/ThaiDateTimeInput';

export interface Responsibility { eventUpdatedAt: string; ownerId: string; owner: string; acceptedAt: string | null; completedAt: string | null; needsEscalation: boolean; canAccept: boolean; reminders: { sentAt: string; channel: string }[]; source: { excerpt: string | null; rule: string | null; reviewedAt: string | null } | null }
export interface ReschedulePreview { fingerprint: string; oldAt: string; newAt: string; impacts: { id: string; title: string; oldAt: string; newAt: string; status: string }[] }
export function EventResponsibility({ eventId, startAt, type, onChanged }: { eventId: string; startAt: string; type: string; onChanged: () => void }) {
  const { token, user } = useAuth();
  const { locale } = useLocale(); const th = locale === 'th';
  const [data, setData] = useState<Responsibility | null>(null);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const [next, setNext] = useState(bangkokInputValue(startAt));
  const [reason, setReason] = useState(''); const [preview, setPreview] = useState<ReschedulePreview | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => { let active = true; if (token) api.getEventResponsibility(token, eventId).then(r => { if (active) setData(r); }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, [token, eventId, reload]);
  async function run(action: () => Promise<unknown>) { setBusy(true); setError(''); try { await action(); } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); } finally { setBusy(false); } }
  const date = (value: string) => new Date(value).toLocaleString(th ? 'th-TH' : 'en-GB', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' });
  return <section className="mt-4 space-y-3 rounded-lg border p-3" aria-label={th ? 'การรับผิดชอบนัด' : 'Appointment responsibility'}>
    <h3 className="font-medium">{th ? 'ผู้รับผิดชอบและการรับงาน' : 'Responsibility and acknowledgement'}</h3>
    {error && <p role="alert" className="text-sm text-destructive">{error}<button type="button" className="ml-2 underline" onClick={() => { setError(''); setReload(r => r + 1); }}>{th ? 'โหลดใหม่' : 'Reload'}</button></p>}
    {data && <><p className="text-sm">{data.owner} · {data.completedAt ? (th ? 'ทำเสร็จแล้ว' : 'Completed') : data.acceptedAt ? (th ? 'รับงานแล้ว' : 'Acknowledged') : (th ? 'ยังไม่รับงาน' : 'Not acknowledged')}</p>
      {data.needsEscalation && <p className="text-sm text-amber-700 dark:text-amber-400">{th ? 'ใกล้ถึงกำหนดหรือเลยกำหนดแล้ว แต่ยังไม่รับงาน ควรติดตามผู้รับผิดชอบ' : 'Due within 48 hours or overdue, with no acknowledgement. Follow up with the owner.'}</p>}
      {data.source && <p className="text-xs text-muted-foreground">{th ? 'ที่มาของวันที่: ' : 'Date source: '}{data.source.rule ?? data.source.excerpt ?? (th ? 'วันที่ผ่านการตรวจ' : 'Reviewed date')}</p>}
      <p className="text-xs text-muted-foreground">{th ? `มีบันทึกการแจ้งเตือน ${data.reminders.length} รายการล่าสุด การส่งเตือนไม่ถือเป็นการรับงาน` : `${data.reminders.length} recent reminder records. Sending a reminder does not acknowledge the work.`}</p>
      {data.canAccept && !data.completedAt && !(data.acceptedAt && type === 'COURT_DATE') && <Button type="button" disabled={busy} variant="outline" className="min-h-11" onClick={() => token && run(async () => { await api.acknowledgeEvent(token, eventId, data.eventUpdatedAt, !!data.acceptedAt); setReload(r => r + 1); onChanged(); })}>{data.acceptedAt ? (th ? 'บันทึกว่าทำเสร็จแล้ว' : 'Mark work complete') : (th ? 'ฉันรับผิดชอบนัดนี้' : 'Acknowledge responsibility')}</Button>}
    </>}
    {!rescheduling && user?.firmRole !== 'ASSISTANT' && <Button type="button" variant="outline" className="min-h-11" onClick={() => setRescheduling(true)}>{th ? 'เลื่อนนัดและตรวจกำหนดที่เกี่ยวข้อง' : 'Reschedule and review related dates'}</Button>}
    {rescheduling && <div className="space-y-3 border-t pt-3">
      <label className="block text-sm">{th ? 'วันและเวลาใหม่ (กรุงเทพฯ)' : 'New date and time (Bangkok)'}<ThaiDateTimeInput className="mt-1" value={next} onChange={v => { setNext(v); setPreview(null); }} /></label>
      <label className="block text-sm">{th ? 'เหตุผลที่เลื่อน' : 'Reason for rescheduling'}<Input value={reason} maxLength={1000} onChange={e => setReason(e.target.value)} /></label>
      {preview && <div className="space-y-2 rounded-md bg-muted p-3 text-sm"><p>{date(preview.oldAt)} → {date(preview.newAt)}</p><p>{th ? `กำหนดที่ได้รับผลกระทบ ${preview.impacts.length} รายการ` : `${preview.impacts.length} affected dates`}</p><ul className="space-y-2">{preview.impacts.map(i => <li key={i.id}><strong>{i.title}</strong><br />{date(i.oldAt)} → {date(i.newAt)}<br /><span className="text-xs">{i.status === 'CONFIRMED' ? (th ? 'การยืนยันนี้จะเปลี่ยนวันในปฏิทินด้วย' : 'Confirmation will also update this calendar deadline.') : (th ? 'ปรับวันที่เสนอ ยังต้องยืนยันก่อนเพิ่มลงปฏิทิน' : 'Updates suggestion; calendar entry still requires approval.')}</span></li>)}</ul><p className="text-xs">{th ? 'ผู้รับผิดชอบต้องรับงานใหม่หลังเลื่อนวัน' : 'The responsible lawyer must acknowledge the revised date.'}</p></div>}
      <div className="flex flex-wrap gap-2"><Button type="button" disabled={busy || !next || !reason.trim()} className="min-h-11" onClick={() => token && run(async () => { if (!preview) { setPreview(await api.previewEventReschedule(token, eventId, bangkokInputToIso(next))); } else { await api.rescheduleEvent(token, eventId, { startAt: bangkokInputToIso(next), fingerprint: preview.fingerprint, reason }); setRescheduling(false); setPreview(null); setReload(r => r + 1); onChanged(); } })}>{preview ? (th ? 'ยืนยันวันใหม่และกำหนดที่แสดง' : 'Confirm these revised dates') : (th ? 'ตรวจผลกระทบก่อน' : 'Preview changes')}</Button><Button type="button" variant="ghost" disabled={busy} onClick={() => { setRescheduling(false); setPreview(null); }}>{th ? 'ยกเลิก' : 'Cancel'}</Button></div>
    </div>}
  </section>;
}
