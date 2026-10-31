'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { hasFirmCapability } from '@lawfirm/shared';
import { api, type CheckedOutPaperFiles } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/samnuan/PageHeader';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { PageLoading, TableEmptyRow } from '@/components/ui/misc';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default function CheckedOutPaperFilesPage() {
  const { token, user } = useAuth();
  const canRunOps = hasFirmCapability(user?.firmRole, 'runOperations');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<CheckedOutPaperFiles | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!token || !canRunOps) return;
    let cancelled = false;
    setData(null);
    setError('');
    void api.getCheckedOutPaperFiles(token, page).then((result) => {
      if (!cancelled) setData(result);
    }).catch((err) => {
      if (!cancelled) setError(err instanceof Error ? err.message : 'โหลดรายการไม่สำเร็จ');
    });
    return () => { cancelled = true; };
  }, [token, canRunOps, page, revision]);

  return (
    <div>
      <PageHeader title="สำนวนที่ถูกเบิกอยู่" description="เรียงจากสำนวนที่เบิกนานที่สุด"
        actions={<Link href="/operations" className={buttonVariants({ variant: 'outline' })}>งานดำเนินการ</Link>} />
      {!canRunOps ? <p role="alert" className="text-sm text-destructive">ไม่มีสิทธิ์ดูรายการสำนวน</p> :
        error ? <LoadFailed message={error} onRetry={() => setRevision((value) => value + 1)} /> :
        !data ? <PageLoading title="กำลังโหลดรายการสำนวน" lines={2} /> : <>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>คดี</TableHead><TableHead>ผู้ถือสำนวน</TableHead><TableHead>วันที่เบิก</TableHead><TableHead className="text-right">จำนวนวัน</TableHead></TableRow></TableHeader>
                <TableBody>
                  {data.items.length === 0 && <TableEmptyRow colSpan={4} title={data.total === 0 ? 'ไม่มีสำนวนที่ถูกเบิกอยู่' : 'ไม่มีรายการในหน้านี้'} />}
                  {data.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <Link href={`/cases/${item.id}`} className="font-medium text-primary underline-offset-4 hover:underline">{item.ownRef} · {item.title}</Link>
                        <p className="mt-1 text-xs text-muted-foreground">{item.folderId}</p>
                      </TableCell>
                      <TableCell>{item.paperFileHolder ? `${item.paperFileHolder.firstName} ${item.paperFileHolder.lastName}` : '—'}</TableCell>
                      <TableCell><time dateTime={item.checkedOutAt}>{new Date(item.checkedOutAt).toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok' })}</time></TableCell>
                      <TableCell className="text-right tabular-nums">{item.daysOut} วัน</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <nav aria-label="หน้ารายการสำนวน" className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p role="status" className="text-sm text-muted-foreground">ทั้งหมด {data.total} รายการ · หน้า {data.page} / {Math.max(1, Math.ceil(data.total / data.pageSize))}</p>
            <div className="flex gap-2">
              <Button variant="outline" disabled={data.page <= 1} onClick={() => setPage((value) => value - 1)}>ก่อนหน้า</Button>
              <Button variant="outline" disabled={data.page * data.pageSize >= data.total} onClick={() => setPage((value) => value + 1)}>ถัดไป</Button>
            </div>
          </nav>
        </>}
    </div>
  );
}
