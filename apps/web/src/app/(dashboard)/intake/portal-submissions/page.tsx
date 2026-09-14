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
import { Inbox } from 'lucide-react';

export default function PortalSubmissionsPage() {
  const { token } = useAuth();
  const [items, setItems] = useState<PortalSubmissionStaffEntry[]>([]);
  const [rooms, setRooms] = useState<{ id: string; title: string; referenceNumber: string }[]>([]);
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = () => {
    if (!token) return;
    setLoading(true);
    workroomRequest<typeof rooms>(token, true, '').then(setRooms).catch(e => setError(e.message));
    api
      .listPortalSubmissions(token)
      .then(setItems)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [token]);

  const handleConvert = async (id: string) => {
    if (!token) return;
    try { await api.convertPortalSubmission(token, id); setSelected(id); load(); } catch(e) { setError(e instanceof Error ? e.message : 'รับเรื่องไม่สำเร็จ'); }
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">เรื่องที่ส่งจาก Customer Portal</h1>
        <p className="text-sm text-muted-foreground">รายการเรื่องที่ลูกความส่งเข้ามาผ่านพอร์ทัล รอรับเข้าเป็นเรื่องรับ (F01)</p>
      </div>

      {error && <p role="alert" className="mb-3 text-destructive">{error}</p>}
      <div className="mb-5"><label className="block text-sm">เปิดห้องทำงานของคำขอ (รวมเรื่องที่รับเข้าแล้ว)<select className="mt-1 h-11 w-full rounded-lg border bg-background px-3" value={selected} onChange={e => setSelected(e.target.value)}><option value="">เลือกคำขอ</option>{rooms.map(r => <option key={r.id} value={r.id}>{r.referenceNumber} · {r.title}</option>)}</select></label>{selected && token && <RequestWorkroom key={selected} id={selected} token={token} staff />}</div>
      <Card>
        <CardContent className="p-0">
          {loading ? (
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
                        <span className="ml-2 rounded bg-red-100 px-2 py-0.5 text-xs text-red-700">
                          เร่งด่วน
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{item.title}</TableCell>
                    <TableCell>{item.client.name}</TableCell>
                    <TableCell>{item.clientContact.name}</TableCell>
                    <TableCell>
                      {new Date(item.submittedAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </TableCell>
                    <TableCell>
                      <Button size="sm" onClick={() => handleConvert(item.id)}>
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
    </div>
  );
}
