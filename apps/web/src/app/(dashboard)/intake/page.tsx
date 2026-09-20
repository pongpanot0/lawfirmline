'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, ClipboardList } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api, IntakeItem, UserItem } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState, PageLoading } from '@/components/ui/misc';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { formatDate } from '@/lib/utils';
import { intakeStageLabel, intakeStageOptions } from '@/lib/stage-labels';

const STATUS_LABELS: Record<string, string> = {
  RECEIVED: 'รับเรื่อง',
  ASSESSING: 'กำลังประเมิน',
  ACCEPTED: 'รับเป็นคดี',
  REJECTED: 'ปฏิเสธ',
  CONVERTED: 'แปลงเป็นคดีแล้ว',
  CONSULTED: 'ให้คำปรึกษาเรียบร้อยแล้ว',
  NO_RESPONSE: 'ไม่ตอบกลับ',
};

/** ค้างขั้นเดิมนานกว่านี้ขึ้นสีเตือน — ตัวเลขเดียวกับในหน้ารายละเอียด */
const STALE_DAYS = 7;

const STATUS_VARIANT: Record<string, string> = {
  RECEIVED: 'bg-gray-100 text-gray-700',
  ASSESSING: 'bg-blue-100 text-blue-700',
  ACCEPTED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
  CONVERTED: 'bg-purple-100 text-purple-700',
  CONSULTED: 'bg-teal-100 text-teal-700',
  NO_RESPONSE: 'bg-amber-100 text-amber-700',
};

export default function IntakePage() {
  const { token } = useAuth();
  const router = useRouter();
  const [intakes, setIntakes] = useState<IntakeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const [statusFilter, setStatusFilter] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [personFilter, setPersonFilter] = useState('');
  const [lawyers, setLawyers] = useState<UserItem[]>([]);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    setLoadError(false);
    api
      .getIntakes(token, {
        status: statusFilter || undefined,
        stage: stageFilter || undefined,
        followUpOverdue: overdueOnly || undefined,
      })
      .then((res) => setIntakes(res.items))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [token, statusFilter, stageFilter, overdueOnly, reloadKey]);

  useEffect(() => {
    if (!token) return;
    api.getLawyers(token).then(setLawyers).catch(() => setLawyers([]));
  }, [token]);

  // "รายคน": the intake payload already carries assignedUserIds and receivedBy,
  // so the person filter is applied client-side.
  const visibleIntakes = personFilter
    ? intakes.filter(
        (i) => (i.assignedUserIds ?? []).includes(personFilter) || i.receivedBy?.id === personFilter,
      )
    : intakes;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">รับเรื่อง</h1>
          <p className="text-sm text-muted-foreground">จัดการเรื่องที่รับเข้ามาก่อนแปลงเป็นคดี</p>
        </div>
        <Button size="sm" onClick={() => router.push('/intake/new')}>
          <Plus className="mr-1 h-4 w-4" />
          สร้างใหม่
        </Button>
      </div>

      <Card className="mb-4">
        <CardContent className="flex flex-wrap gap-3 p-4">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 rounded-lg border border-input bg-card px-3 text-sm"
          >
            <option value="">ทุกสถานะ</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <select
            aria-label="กรองตามขั้นตอน"
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            className="h-9 rounded-lg border border-input bg-card px-3 text-sm"
          >
            <option value="">ทุกขั้นตอน</option>
            {intakeStageOptions('th').map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={overdueOnly}
              onChange={(e) => setOverdueOnly(e.target.checked)}
            />
            เฉพาะที่ต้องติดตาม
          </label>
          <select
            aria-label="กรองตามผู้รับผิดชอบ"
            value={personFilter}
            onChange={(e) => setPersonFilter(e.target.value)}
            className="h-9 rounded-lg border border-input bg-card px-3 text-sm"
          >
            <option value="">ทุกคน</option>
            {lawyers.map((u) => (
              <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
            ))}
          </select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loadError ? (
            <div className="p-4"><LoadFailed onRetry={() => setReloadKey((k) => k + 1)} /></div>
          ) : loading ? (
            <div className="p-4"><PageLoading title="กำลังโหลดเรื่องรับเข้า" lines={3} /></div>
          ) : visibleIntakes.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="ยังไม่มีเรื่องที่รับ"
              description="กดสร้างใหม่เพื่อรับเรื่องแรก"
              action={<Button onClick={() => router.push('/intake/new')}>สร้างใหม่</Button>}
            />
          ) : (
            <div className="divide-y">
              {visibleIntakes.map((item) => (
                <div
                  key={item.id}
                  className="flex cursor-pointer items-center gap-4 px-4 py-3 hover:bg-muted/50"
                  onClick={() => router.push(`/intake/${item.id}`)}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">
                      {item.title || item.matterType || item.clientName || item.client?.name || '(ไม่ระบุชื่อ)'}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {item.referralName || item.clientName || item.client?.name || '—'} · รับเมื่อ {formatDate(item.receivedDate)}
                    </p>
                  </div>
                  {/* ค้างอยู่ตรงไหน กี่วัน — คำถามแรกของหน้านี้ ไม่ใช่สถานะ */}
                  <div className="shrink-0 text-right">
                    {item.stage && (
                      <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                        {intakeStageLabel(item.stage, 'th')}
                      </span>
                    )}
                    {typeof item.daysInStage === 'number' && (
                      <p
                        className={`mt-0.5 text-xs ${
                          item.daysInStage >= STALE_DAYS && item.stage !== 'CLOSED'
                            ? 'font-medium text-destructive'
                            : 'text-muted-foreground'
                        }`}
                      >
                        ค้าง {item.daysInStage} วัน
                        {typeof item.followUpOverdueDays === 'number' && item.followUpOverdueDays > 0
                          ? ` · เลยนัด ${item.followUpOverdueDays} วัน`
                          : ''}
                      </p>
                    )}
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_VARIANT[item.status] ?? 'bg-gray-100 text-gray-700'}`}
                  >
                    {STATUS_LABELS[item.status] ?? item.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
