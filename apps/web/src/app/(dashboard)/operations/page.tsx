'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { FirmRole } from '@lawfirm/shared';
import { api, WorkloadSummary, WorkloadDetail, PairingEntry, OnHoldTaskEntry } from '@/lib/api';
import { PageHeader } from '@/components/lexflow/PageHeader';
import { OnHoldResumeButton } from './onhold-actions';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/misc';

export default function OperationsPage() {
  const { token, user } = useAuth();
  const isOwner = user?.firmRole === FirmRole.OWNER;
  const [tab, setTab] = useState('workload');
  const [summary, setSummary] = useState<WorkloadSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [nearDeadlineDays, setNearDeadlineDays] = useState(7);
  const [sortDesc, setSortDesc] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [detail, setDetail] = useState<WorkloadDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [pairing, setPairing] = useState<PairingEntry[]>([]);
  const [pairingLoading, setPairingLoading] = useState(true);
  const [onHold, setOnHold] = useState<OnHoldTaskEntry[]>([]);
  const [onHoldLoading, setOnHoldLoading] = useState(true);

  useEffect(() => {
    if (!token || !isOwner) return;
    setLoading(true);
    api
      .getWorkloadSummary(token, nearDeadlineDays)
      .then(setSummary)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [token, isOwner, nearDeadlineDays]);

  useEffect(() => {
    if (!token || !isOwner || !selectedUserId) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    api
      .getWorkloadDetail(token, selectedUserId, nearDeadlineDays)
      .then(setDetail)
      .catch(console.error)
      .finally(() => setDetailLoading(false));
  }, [token, isOwner, selectedUserId, nearDeadlineDays]);

  useEffect(() => {
    if (!token || !isOwner) return;
    setPairingLoading(true);
    api.getPairing(token).then(setPairing).catch(console.error).finally(() => setPairingLoading(false));
  }, [token, isOwner]);

  const loadOnHold = () => {
    if (!token || !isOwner) return;
    setOnHoldLoading(true);
    api
      .getOnHoldTasks(token)
      .then(setOnHold)
      .catch(console.error)
      .finally(() => setOnHoldLoading(false));
  };

  useEffect(loadOnHold, [token, isOwner]);

  const sorted = [...summary].sort((a, b) => {
    const diff = a.leadCount + a.buddyCount - (b.leadCount + b.buddyCount);
    return sortDesc ? -diff : diff;
  });

  if (!isOwner) {
    return <p className="text-destructive">Owner access only / เฉพาะเจ้าของสำนักงานเท่านั้น</p>;
  }

  return (
    <div>
      <PageHeader title="Operations" description="ภาพรวมภาระงานและการจับคู่ทีมงาน" />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="workload">Workload</TabsTrigger>
          <TabsTrigger value="pairing">Pairing</TabsTrigger>
          <TabsTrigger value="onhold">On Hold</TabsTrigger>
        </TabsList>

        <TabsContent value="workload">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              ใกล้ deadline ภายใน
              <Input
                type="number"
                min={1}
                value={nearDeadlineDays}
                onChange={(e) => setNearDeadlineDays(Math.max(1, Number(e.target.value) || 7))}
                className="h-8 w-16"
              />
              วัน
            </label>
            <Button size="sm" variant="outline" onClick={() => setSortDesc((s) => !s)}>
              {sortDesc ? 'เรียง: มากไปน้อย' : 'เรียง: น้อยไปมาก'}
            </Button>
          </div>

          <div className="grid gap-6 lg:grid-cols-12">
            <Card className="lg:col-span-7">
              <CardContent className="p-0">
                {loading ? (
                  <p className="p-6 text-sm text-muted-foreground">กำลังโหลด...</p>
                ) : sorted.length === 0 ? (
                  <EmptyState title="ไม่มีข้อมูลทนายในสำนักงาน" />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ทนาย</TableHead>
                        <TableHead>Lead</TableHead>
                        <TableHead>Buddy</TableHead>
                        <TableHead>ใกล้ deadline</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sorted.map((s) => (
                        <TableRow
                          key={s.userId}
                          className="cursor-pointer"
                          onClick={() => setSelectedUserId(s.userId)}
                          data-state={selectedUserId === s.userId ? 'selected' : undefined}
                        >
                          <TableCell className="font-medium">
                            {s.firstName} {s.lastName}
                          </TableCell>
                          <TableCell>{s.leadCount}</TableCell>
                          <TableCell>{s.buddyCount}</TableCell>
                          <TableCell>{s.nearDeadlineCount}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-5">
              <CardContent className="p-4">
                {!selectedUserId ? (
                  <p className="text-sm text-muted-foreground">เลือกทนายจากตารางเพื่อดูรายละเอียด</p>
                ) : detailLoading || !detail ? (
                  <p className="text-sm text-muted-foreground">กำลังโหลด...</p>
                ) : (
                  <div className="space-y-3">
                    <p className="font-semibold">
                      {detail.firstName} {detail.lastName}
                    </p>
                    {detail.cases.length === 0 ? (
                      <p className="text-sm text-muted-foreground">ไม่มีคดี active</p>
                    ) : (
                      <ul className="space-y-2">
                        {detail.cases.map((c) => (
                          <li key={c.caseId} className="rounded-lg border border-border p-3 text-sm">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium">{c.title}</span>
                              <span className="rounded bg-muted px-2 py-0.5 text-xs">{c.role}</span>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              สถานะ: {c.status} ·{' '}
                              {c.nearestDeadlineDays === null
                                ? 'ไม่มี deadline ใกล้ตัว'
                                : c.nearestDeadlineDays < 0
                                  ? `เลยกำหนดมาแล้ว ${Math.abs(c.nearestDeadlineDays)} วัน`
                                  : `อีก ${c.nearestDeadlineDays} วัน`}
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="pairing">
          <Card>
            <CardContent className="p-0">
              {pairingLoading ? (
                <p className="p-6 text-sm text-muted-foreground">กำลังโหลด...</p>
              ) : pairing.length === 0 ? (
                <EmptyState title="ยังไม่มีคู่ทำงานร่วมกัน" />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>คู่</TableHead>
                      <TableHead>จำนวนคดีร่วมกัน</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pairing.map((p) => (
                      <TableRow key={`${p.userAId}:${p.userBId}`}>
                        <TableCell className="font-medium">
                          {p.userAName} + {p.userBName}
                        </TableCell>
                        <TableCell>{p.count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="onhold">
          <Card>
            <CardContent className="p-0">
              {onHoldLoading ? (
                <p className="p-6 text-sm text-muted-foreground">กำลังโหลด...</p>
              ) : onHold.length === 0 ? (
                <EmptyState title="ไม่มีงาน On hold ในขณะนี้" />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>งาน</TableHead>
                      <TableHead>คดี</TableHead>
                      <TableHead>ผู้รับผิดชอบ</TableHead>
                      <TableHead>เหตุผล</TableHead>
                      <TableHead>ผู้ติดตาม</TableHead>
                      <TableHead>วันติดตามถัดไป</TableHead>
                      <TableHead>กำหนดส่ง</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {onHold.map((item) => (
                      <TableRow key={item.taskId}>
                        <TableCell>{item.taskTitle}</TableCell>
                        <TableCell>
                          {item.caseOwnRef ?? '-'} {item.caseTitle ?? ''}
                        </TableCell>
                        <TableCell>{item.assigneeName ?? '-'}</TableCell>
                        <TableCell>{item.reason}</TableCell>
                        <TableCell>{item.followerName ?? '-'}</TableCell>
                        <TableCell>
                          {item.nextFollowUpAt
                            ? new Date(item.nextFollowUpAt).toLocaleDateString('th-TH')
                            : '-'}
                        </TableCell>
                        <TableCell>
                          {item.dueDate ? (
                            <span className={item.isOverdue ? 'text-red-600 font-medium' : ''}>
                              {new Date(item.dueDate).toLocaleDateString('th-TH')}
                              {item.isOverdue ? ' (เกินกำหนด)' : ''}
                            </span>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell>
                          <OnHoldResumeButton
                            token={token!}
                            caseId={item.caseId}
                            taskId={item.taskId}
                            onResumed={loadOnHold}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
