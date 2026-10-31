'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { api, ApiError, PlatformFirm, PlatformFirmMember, PlatformFirmUpdate, PlatformOverview } from '@/lib/api';
import { bangkokDateInputValue } from '@/lib/bangkok';
import { formatDate } from '@/lib/utils';
import { PageHeader } from '@/components/samnuan/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DateField, SelectField, TextField } from '@/components/ui/form-fields';
import { SideDrawer } from '@/components/ui/SideDrawer';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { EmptyState, Skeleton } from '@/components/ui/misc';

const STATUSES: PlatformFirm['subscriptionStatus'][] = ['TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED'];
const PLANS = ['FREE', 'SOLO', 'TEAM', 'FIRM', 'PROFESSIONAL'] as const;
const STATUS_LABEL: Record<PlatformFirm['subscriptionStatus'], string> = {
  TRIAL: 'ทดลองใช้',
  ACTIVE: 'ใช้งาน',
  PAST_DUE: 'ค้างชำระ',
  CANCELED: 'ยกเลิก',
  EXPIRED: 'หมดอายุ',
};
const STATUS_VARIANT: Record<PlatformFirm['subscriptionStatus'], 'success' | 'warning' | 'destructive' | 'muted'> = {
  TRIAL: 'warning',
  ACTIVE: 'success',
  PAST_DUE: 'destructive',
  CANCELED: 'muted',
  EXPIRED: 'destructive',
};

/** End of the chosen Bangkok day, so "trial until 30 Nov" includes 30 Nov. */
const endOfBangkokDay = (value: string) => new Date(`${value}T23:59:59+07:00`).toISOString();

export default function SuperadminPage() {
  const { token } = useAuth();
  const [overview, setOverview] = useState<PlatformOverview | null>(null);
  const [firms, setFirms] = useState<PlatformFirm[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [editing, setEditing] = useState<PlatformFirm | null>(null);

  const load = () => {
    if (!token) return;
    setLoading(true);
    setError(false);
    Promise.all([api.getPlatformOverview(token), api.getPlatformFirms(token, q.trim() || undefined)])
      .then(([o, f]) => {
        setOverview(o);
        setFirms(f);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, q]);

  const stats = overview && [
    { label: 'สำนักงานทั้งหมด', value: Object.values(overview.firmsByStatus).reduce((a, b) => a + (b ?? 0), 0) },
    { label: 'ใช้งาน (จ่าย/ฟรี)', value: overview.firmsByStatus.ACTIVE ?? 0 },
    { label: 'ทดลองใช้', value: overview.firmsByStatus.TRIAL ?? 0 },
    { label: 'ค้างชำระ / หมดอายุ', value: (overview.firmsByStatus.PAST_DUE ?? 0) + (overview.firmsByStatus.EXPIRED ?? 0) },
    { label: 'สมัครใหม่ 30 วัน', value: overview.newFirms30d },
    { label: 'ผู้ใช้ทั้งหมด', value: overview.users },
    { label: 'รายรับ 30 วัน (บาท)', value: overview.revenue30d.toLocaleString('th-TH') },
  ];

  return (
    <div>
      <PageHeader title="ทุกสำนักงาน" description="ดูและจัดการทุกสำนักงานที่ใช้โปรแกรม" />

      {stats && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {stats.map((s) => (
            <Card key={s.label}>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <TextField
        label="ค้นหา"
        placeholder="ชื่อสำนักงาน, slug หรืออีเมลสมาชิก"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        containerClassName="mb-4 max-w-sm"
      />

      {error ? (
        <LoadFailed message="โหลดรายการสำนักงานไม่สำเร็จ" onRetry={load} />
      ) : firms.length === 0 && loading ? (
        <div role="status" className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}</div>
      ) : firms.length === 0 ? (
        <EmptyState title="ไม่พบสำนักงาน" />
      ) : (
        <div className="space-y-2">
          {firms.map((firm) => (
            <Card key={firm.id}>
              <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{firm.name}</span>
                    <span className="font-mono text-xs text-muted-foreground">{firm.slug}</span>
                    <Badge variant={STATUS_VARIANT[firm.subscriptionStatus]}>{STATUS_LABEL[firm.subscriptionStatus]}</Badge>
                    {firm.subscriptionPlan && <Badge variant="outline">{firm.subscriptionPlan}</Badge>}
                    {firm.stripeManaged && <Badge variant="outline">Stripe</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {firm.ownerEmail ?? 'ไม่มีเจ้าของ'} · สมาชิก {firm.memberCount}/{firm.maxUsers} · คดี {firm.caseCount}
                  </p>
                  <p className="text-xs tabular-nums text-muted-foreground">
                    สมัคร {formatDate(firm.createdAt)}
                    {firm.subscriptionStatus === 'TRIAL' && ` · ทดลองถึง ${formatDate(firm.trialEndAt)}`}
                    {firm.currentPeriodEnd && ` · รอบบิลถึง ${formatDate(firm.currentPeriodEnd)}`}
                  </p>
                </div>
                <Button type="button" variant="outline" onClick={() => setEditing(firm)}>จัดการ</Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <SideDrawer open={!!editing} title={editing?.name ?? ''} onClose={() => setEditing(null)}>
        {editing && token && (
          <FirmEditor
            key={editing.id}
            token={token}
            firm={editing}
            onSaved={() => {
              setEditing(null);
              load();
            }}
          />
        )}
      </SideDrawer>
    </div>
  );
}

function FirmEditor({ token, firm, onSaved }: { token: string; firm: PlatformFirm; onSaved: () => void }) {
  const [initial] = useState(() => ({
    subscriptionStatus: firm.subscriptionStatus,
    subscriptionPlan: firm.subscriptionPlan ?? '',
    maxUsers: String(firm.maxUsers),
    trialEndAt: bangkokDateInputValue(firm.trialEndAt),
    currentPeriodEnd: firm.currentPeriodEnd ? bangkokDateInputValue(firm.currentPeriodEnd) : '',
  }));
  const [form, setForm] = useState(initial);
  const [members, setMembers] = useState<PlatformFirmMember[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    api.getPlatformFirmMembers(token, firm.id).then(setMembers).catch(() => setMembers([]));
  }, [token, firm.id]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    // Only what changed, so untouched dates keep their exact time and the audit log shows the real edit.
    const changed = (key: keyof typeof form) => form[key] !== initial[key];
    const data: PlatformFirmUpdate = {
      ...(changed('subscriptionStatus') && { subscriptionStatus: form.subscriptionStatus }),
      ...(changed('subscriptionPlan') && form.subscriptionPlan && { subscriptionPlan: form.subscriptionPlan as PlatformFirmUpdate['subscriptionPlan'] }),
      ...(changed('maxUsers') && { maxUsers: Number(form.maxUsers) }),
      ...(changed('trialEndAt') && { trialEndAt: endOfBangkokDay(form.trialEndAt) }),
      ...(changed('currentPeriodEnd') && { currentPeriodEnd: form.currentPeriodEnd ? endOfBangkokDay(form.currentPeriodEnd) : null }),
    };
    if (Object.keys(data).length === 0) return onSaved();
    setSaving(true);
    setSaveError('');
    try {
      await api.updatePlatformFirm(token, firm.id, data);
      onSaved();
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <form onSubmit={save} className="space-y-3">
        {firm.stripeManaged && (
          <p className="rounded-lg bg-muted p-3 text-sm">
            สำนักงานนี้จ่ายผ่าน Stripe — สถานะ/แพ็กเกจอาจถูก webhook ของ Stripe เขียนทับเมื่อมีรอบบิลใหม่
          </p>
        )}
        <SelectField label="สถานะ" value={form.subscriptionStatus} onChange={(e) => setForm({ ...form, subscriptionStatus: e.target.value as PlatformFirm['subscriptionStatus'] })}>
          {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]} ({s})</option>)}
        </SelectField>
        <SelectField label="แพ็กเกจ" value={form.subscriptionPlan} onChange={(e) => setForm({ ...form, subscriptionPlan: e.target.value as typeof form.subscriptionPlan })}>
          {!firm.subscriptionPlan && <option value="">— ไม่มี —</option>}
          {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
        </SelectField>
        <TextField label="จำนวนผู้ใช้สูงสุด" type="number" min={1} max={1000} required value={form.maxUsers} onChange={(e) => setForm({ ...form, maxUsers: e.target.value })} />
        <DateField label="ทดลองใช้ถึง (รวมวันนั้น)" required value={form.trialEndAt} onChange={(e) => setForm({ ...form, trialEndAt: e.target.value })} />
        <DateField
          label="รอบบิลถึง (เว้นว่าง = ไม่หมดอายุ)"
          hint="ใช้กับลูกค้าที่โอนเงินเอง: สถานะ ใช้งาน + วันสิ้นสุดรอบ"
          value={form.currentPeriodEnd}
          onChange={(e) => setForm({ ...form, currentPeriodEnd: e.target.value })}
        />
        {saveError && <p className="text-sm text-destructive">{saveError}</p>}
        <Button type="submit" disabled={saving}>{saving ? 'กำลังบันทึก…' : 'บันทึก'}</Button>
      </form>

      <section>
        <h3 className="mb-2 text-sm font-semibold">สมาชิก</h3>
        {members === null ? (
          <Skeleton className="h-16 w-full rounded-lg" />
        ) : members.length === 0 ? (
          <p className="text-sm text-muted-foreground">ไม่มีสมาชิก</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {members.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className="min-w-0">
                  {m.firstName} {m.lastName}
                  <span className="block truncate text-xs text-muted-foreground">{m.email}</span>
                </span>
                <Badge variant="outline">{m.role}</Badge>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
