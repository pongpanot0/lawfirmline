'use client';

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
  const [loading, setLoading] = useState(true);

  const load = () => {
    if (!token) return;
    setLoading(true);
    api
      .listPortalSubmissions(token)
      .then(setItems)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(load, [token]);

  const handleConvert = async (id: string) => {
    if (!token) return;
    await api.convertPortalSubmission(token, id);
    load();
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">เรื่องที่ส่งจาก Customer Portal</h1>
        <p className="text-sm text-muted-foreground">รายการเรื่องที่ลูกความส่งเข้ามาผ่านพอร์ทัล รอรับเข้าเป็นเรื่องรับ (F01)</p>
      </div>

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
