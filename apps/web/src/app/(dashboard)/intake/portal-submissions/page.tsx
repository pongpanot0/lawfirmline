'use client';

import { RequestWorkroom } from '@/components/portal/RequestWorkroom';
import { workroomRequest } from '@/lib/workroom-api';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { api, type PortalSubmissionStaffEntry } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { EmptyState, PageLoading } from '@/components/ui/misc';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/samnuan/PageHeader';
import { Inbox } from 'lucide-react';
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
      <PageHeader title="เรื่องจาก Customer Portal" description="เรื่องที่ลูกความส่งผ่านพอร์ทัล รอรับเข้าเป็น F01" />

      {error && <p role="alert" className="mb-3 text-destructive">{error}</p>}
      <div className="mb-5"><label className="block text-sm">เปิดห้องทำงานของคำขอ (รวมเรื่องที่รับเข้าแล้ว)<select className="mt-1 h-11 w-full rounded-lg border bg-background px-3" value={selected} onChange={e => setSelected(e.target.value)}><option value="">เลือกคำขอ</option>{rooms.map(r => <option key={r.id} value={r.id}>{r.referenceNumber} · {r.title}</option>)}</select></label>{selected && token && <RequestWorkroom key={selected} id={selected} token={token} staff />}</div>
      <Card>
        <CardContent className="p-0">
          {listFailed ? (
            <div className="p-4">
              <LoadFailed onRetry={load} />
            </div>
          ) : loading ? (
            <div className="p-4">
              <PageLoading title="กำลังโหลดเรื่องจากพอร์ทัล" lines={3} />
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="ไม่มีเรื่องรอรับเข้า"
              description="เมื่อลูกความส่งงานหรือไฟล์จาก Customer Portal รายการจะรอรับเข้าเป็น F01 ที่นี่"
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>เลขอ้างอิง</TableHead>
                  <TableHead>หัวข้อ</TableHead>
                  <TableHead>ลูกความ</TableHead>
                  <TableHead>ผู้ส่ง</TableHead>
                  <TableHead>วันที่ส่ง</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      {item.referenceNumber}
                      {item.urgencyFlag && (
                        <Badge variant="destructive" className="ml-2">
                          เร่งด่วน
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{item.title}</TableCell>
                    <TableCell>{item.client.name}</TableCell>
                    <TableCell>{item.clientContact.name}</TableCell>
                    <TableCell>
                      {new Date(item.submittedAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" disabled={converting} onClick={() => handleConvert(item.id)}>
                        รับเข้า F01
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      {conflict && (
        <ConflictOverrideDialog matches={conflict.matches} busy={converting} onCancel={() => setConflict(null)} onConfirm={conflict.retry} />
      )}
    </div>
  );
}
