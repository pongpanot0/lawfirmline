'use client';

import { RequestWorkroom } from '@/components/portal/RequestWorkroom';
import { workroomRequest } from '@/lib/workroom-api';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { api, type PortalSubmissionStaffEntry } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState, PageLoading } from '@/components/ui/misc';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/samnuan/PageHeader';
import { Inbox, X } from 'lucide-react';
import { ConflictOverrideDialog } from '@/components/ConflictOverrideDialog';
import { conflictMatchesFrom, type ConflictMatchItem } from '@/lib/conflict';

export default function PortalSubmissionsPage() {
  const { token } = useAuth();
  const [items, setItems] = useState<PortalSubmissionStaffEntry[]>([]);
  const [rooms, setRooms] = useState<{ id: string; title: string; referenceNumber: string }[]>([]);
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [listFailed, setListFailed] = useState(false);
  const [conflict, setConflict] = useState<{ matches: ConflictMatchItem[]; retry: (reason: string) => void } | null>(null);
  const [converting, setConverting] = useState(false);
  const [tab, setTab] = useState<'pending' | 'received'>('pending');

  const load = () => {
    if (!token) return;
    setLoading(true);
    setListFailed(false);
    workroomRequest<typeof rooms>(token, true, '').then(setRooms).catch(e => setError(e.message));
    api
      .listPortalSubmissions(token)
      .then(setItems)
      .catch(() => setListFailed(true))
      .finally(() => setLoading(false));
  };

  useEffect(load, [token]);

  const handleConvert = async (id: string, reason?: string) => {
    if (!token) return;
    setConverting(true);
    try {
      await api.convertPortalSubmission(token, id, reason ? { conflictOverrideReason: reason } : {});
      setConflict(null);
      setSelected(id);
      load();
    } catch (e) {
      const matches = conflictMatchesFrom(e);
      if (matches) setConflict({ matches, retry: (r) => void handleConvert(id, r) });
      else { setConflict(null); setError(e instanceof Error ? e.message : 'รับเรื่องไม่สำเร็จ'); }
    } finally {
      setConverting(false);
    }
  };

  return (
    <div>
      <PageHeader title="เรื่องจากพอร์ทัลลูกความ" description="คำขอที่ลูกความส่งผ่านพอร์ทัล ตรวจแล้วรับเข้าเป็นคดีก่อนฟ้อง" />

      {error && <p role="alert" className="mb-3 text-destructive">{error}</p>}
      <div className="mb-6 grid grid-cols-2 rounded-xl border bg-card p-2"><button className={`min-h-11 rounded-md ${tab === 'pending' ? 'border-b-2 border-primary font-semibold' : ''}`} onClick={() => { setTab('pending'); setSelected(''); }}>รอรับเข้า {items.length}</button><button className={`min-h-11 rounded-md ${tab === 'received' ? 'border-b-2 border-primary font-semibold' : ''}`} onClick={() => { setTab('received'); setSelected(''); }}>รับแล้ว</button></div>
      <div className="grid min-w-0 gap-6 lg:grid-cols-5"><div className="min-w-0 lg:col-span-3">
      {tab === 'received' ? <div className="space-y-2">{rooms.filter(room => !items.some(item => item.id === room.id)).map(room => <button key={room.id} className="block w-full rounded-xl border bg-card p-4 text-left" onClick={() => setSelected(room.id)}>{room.referenceNumber} · {room.title}</button>)}</div> : <div className="rounded-xl border-l-4 border-[var(--color-brass)] bg-[var(--operations-highlight)] p-4"><h2 className="mb-4 text-xl font-semibold">รอรับเข้า {items.length} เรื่อง</h2>
      <Card>
        <CardContent className="p-0">
          {listFailed ? (
            <div className="p-4">
              <LoadFailed onRetry={load} />
            </div>
          ) : loading ? (
            <div className="p-4">
              <PageLoading variant="list" title="กำลังโหลดเรื่องจากพอร์ทัล" lines={3} />
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="ไม่มีเรื่องรอรับเข้า"
              description="เมื่อลูกความส่งงานหรือไฟล์ผ่านพอร์ทัล รายการที่รอรับเรื่องจะแสดงที่นี่"
            />
          ) : (
            <div className="divide-y">
              {items.map((item) => (
                <article key={item.id} className="flex min-w-0 flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 space-y-1 break-words">
                    <h2 className="font-semibold">{item.title}</h2>
                    <p className="text-sm text-muted-foreground">{item.referenceNumber} · {item.client.name} · {item.clientContact.name}</p>
                    <p className="text-sm text-muted-foreground">ส่งเมื่อ {new Date(item.submittedAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                    {item.urgencyFlag && <Badge variant="destructive">เร่งด่วน</Badge>}
                  </div>
                  <Button className="min-h-11 shrink-0" variant="outline" title="เปิดรายละเอียดก่อนรับเรื่อง" onClick={() => setSelected(item.id)}>ตรวจคำขอ</Button>
                </article>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      </div>}</div>
      {selected && token && <aside className="min-w-0 rounded-xl border bg-card p-4 lg:col-span-2"><div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-semibold">ตรวจคำขอ</h2><Button variant="ghost" size="icon" aria-label="ปิดแผงตรวจ" onClick={() => setSelected('')}><X className="h-4 w-4" /></Button></div>{items.filter(item => item.id === selected).map(item => <div key={item.id} className="space-y-3 border-b pb-4"><p className="text-sm text-muted-foreground">{item.referenceNumber}</p><h3 className="font-semibold">{item.title}</h3><p className="whitespace-pre-wrap break-words">{item.detail}</p><p className="text-sm">ลูกความ: {item.client.name} · {item.clientContact.name}</p></div>)}<RequestWorkroom key={selected} id={selected} token={token} staff />{items.find(item => item.id === selected) && <div className="mt-4 border-t pt-4"><Button disabled={converting} title="รับเรื่องเข้าสำนักงานและเปิดเป็นคดีขั้นก่อนฟ้อง" onClick={() => { const item = items.find(entry => entry.id === selected); if (item && window.confirm(`รับเรื่อง "${item.title}" เข้าสำนักงาน?\nระบบจะเปิดเป็นคดีขั้นก่อนฟ้อง`)) void handleConvert(item.id); }}>รับเข้าเป็นคดีก่อนฟ้อง</Button><p className="mt-1 text-xs text-muted-foreground">ระบบถามยืนยันก่อน แล้วสร้างคดีก่อนฟ้อง</p></div>}</aside>}</div>
      {conflict && (
        <ConflictOverrideDialog matches={conflict.matches} busy={converting} onCancel={() => setConflict(null)} onConfirm={conflict.retry} />
      )}
    </div>
  );
}
