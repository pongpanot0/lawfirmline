'use client';

import { useEffect, useState } from 'react';
import { hasFirmCapability } from '@lawfirm/shared';
import { useAuth } from '@/lib/auth';
import { useDashboardT } from '@/components/landing/LocaleProvider';
import { fmt } from '@/lib/i18n/dashboard';
import { api, AuditLogItem } from '@/lib/api';
import { PageHeader } from '@/components/samnuan/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { AUDIT_ACTIONS, auditActionText } from '@/lib/audit-actions';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { Button } from '@/components/ui/button';
import { EmptyState, Skeleton } from '@/components/ui/misc';
import { Select } from '@/components/ui/select';

export default function AuditLogPage() {
  const d = useDashboardT();
  const { token, user } = useAuth();
  const [items, setItems] = useState<AuditLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [actionFilter, setActionFilter] = useState('');
  const [cursor, setCursor] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = (append: boolean) => {
    if (!token) return;
    setLoading(true);
    setError(false);
    api.getAuditLogs(token, { action: actionFilter || undefined, cursor: append ? cursor : undefined })
      .then((result) => {
        setItems((prev) => (append ? [...prev, ...result.items] : result.items));
        setTotal(result.total);
        setCursor(result.items.at(-1)?.id);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, actionFilter]);

  if (!hasFirmCapability(user?.firmRole, 'viewFirmReports')) {
    return <p className="text-destructive">{d.admin.accessDenied}</p>;
  }

  return (
    <div>
      <PageHeader title={d.admin.auditLogTitle} description={d.admin.auditLogDescription} />

      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <label className="w-full text-sm font-medium">ประเภทเหตุการณ์
            <Select className="mt-2 h-10 w-full rounded-lg border bg-card px-3" value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
              <option value="">ทั้งหมด</option>{Object.entries(AUDIT_ACTIONS).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
            </Select>
          </label>
        </CardContent>
      </Card>

      {error ? (
        <LoadFailed message={d.admin.auditLogLoadFailed} onRetry={() => load(false)} />
      ) : items.length === 0 && loading ? (
        <div role="status" aria-label={d.common.loading} className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState title={d.admin.auditLogEmpty} description="ลองล้างคำกรองเพื่อดูรายการทั้งหมด" />
      ) : (
        <>
          <p className="mb-2 text-xs tabular-nums text-muted-foreground">{fmt(d.admin.auditLogTotal, { count: total })}</p>
          <div className="space-y-4">
            {Object.entries(items.reduce<Record<string, AuditLogItem[]>>((groups, item) => { const day = new Date(item.createdAt).toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); (groups[day] ??= []).push(item); return groups; }, {})).map(([day, entries]) => (
              <Card key={day}>
                <div className="border-b bg-muted/40 px-5 py-4 font-semibold">{day} · {entries?.length} กิจกรรม</div>
                <CardContent className="divide-y p-0">{entries?.map((item) => (
                  <div key={item.id} className="flex items-start justify-between gap-3 p-4">
                    <p className="text-sm"><span className="font-semibold">{item.user ? `${item.user.firstName} ${item.user.lastName}` : d.admin.auditLogSystem}</span> {auditActionText(item.action)}</p>
                    <time className="shrink-0 text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</time>
                  </div>
                ))}</CardContent>
              </Card>
            ))}
          </div>
          {items.length < total && (
            <div className="mt-4 flex justify-center">
              <Button type="button" variant="outline" disabled={loading} onClick={() => load(true)}>
                {d.admin.auditLogLoadMore}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
