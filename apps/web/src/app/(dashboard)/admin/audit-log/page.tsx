'use client';

import { useEffect, useState } from 'react';
import { FirmRole } from '@lawfirm/shared';
import { useAuth } from '@/lib/auth';
import { useDashboardT } from '@/components/landing/LocaleProvider';
import { fmt } from '@/lib/i18n/dashboard';
import { api, AuditLogItem } from '@/lib/api';
import { PageHeader } from '@/components/samnuan/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/misc';

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

  if (user?.firmRole !== FirmRole.OWNER) {
    return <p className="text-destructive">{d.admin.accessDenied}</p>;
  }

  return (
    <div>
      <PageHeader title={d.admin.auditLogTitle} description={d.admin.auditLogDescription} />

      <div className="mb-4 max-w-sm">
        <label className="text-sm font-medium">{d.admin.auditLogFilterAction}</label>
        <Input
          placeholder={d.admin.auditLogAllActions}
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value.trim())}
          className="mt-1"
        />
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">{d.admin.auditLogLoadFailed}</p>
      ) : items.length === 0 && !loading ? (
        <EmptyState title={d.admin.auditLogEmpty} />
      ) : (
        <>
          <p className="mb-2 text-xs text-muted-foreground">{fmt(d.admin.auditLogTotal, { count: total })}</p>
          <div className="space-y-2">
            {items.map((item) => (
              <Card key={item.id}>
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs">{item.action}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(item.createdAt).toLocaleString('th-TH')}
                    </span>
                  </div>
                  <p className="mt-2 text-sm">
                    {item.user ? `${item.user.firstName} ${item.user.lastName}` : d.admin.auditLogSystem}
                  </p>
                  {item.metadata && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-primary underline">รายละเอียด</summary>
                      <pre className="mt-1 overflow-x-auto rounded-md bg-muted p-2 text-xs">
                        {JSON.stringify(item.metadata, null, 2)}
                      </pre>
                    </details>
                  )}
                </CardContent>
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
