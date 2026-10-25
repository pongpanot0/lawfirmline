'use client';

import { useEffect, useState } from 'react';
import { Laptop2 } from 'lucide-react';
import { SessionInfo } from '@lawfirm/shared';
import { useAuth, REFRESH_KEY } from '@/lib/auth';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/misc';
import { useDashboardT } from '@/components/landing/LocaleProvider';

export function SessionsPanel() {
  const d = useDashboardT();
  const { token } = useAuth();
  const [sessions, setSessions] = useState<SessionInfo[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [revokingOthers, setRevokingOthers] = useState(false);

  const load = async () => {
    if (!token) return;
    try {
      setSessions(await api.listSessions(token));
    } catch {
      setSessions([]);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const revoke = async (id: string) => {
    if (!token) return;
    const device = sessions?.find((s) => s.id === id)?.userAgent ?? d.settings.sessionsUnknownDevice;
    if (!confirm(`${d.settings.sessionsRevoke}?\n${device}`)) return;
    setBusyId(id);
    try {
      await api.revokeSession(token, id);
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const revokeOthers = async () => {
    if (!token) return;
    const refreshToken = localStorage.getItem(REFRESH_KEY);
    if (!refreshToken) return;
    if (!confirm(`${d.settings.sessionsRevokeOthers}?`)) return;
    setRevokingOthers(true);
    try {
      await api.revokeOtherSessions(token, refreshToken);
      await load();
    } finally {
      setRevokingOthers(false);
    }
  };

  if (sessions === null) return <div role="status" aria-label={d.common.loading} className="border-t border-border pt-3"><Skeleton className="h-16 w-full" /></div>;

  return (
    <div className="space-y-3 border-t border-border pt-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium">{d.settings.sessionsTitle}</p>
        {sessions.length > 1 && (
          <Button variant="outline" size="sm" className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={revokingOthers} onClick={revokeOthers}>
            {d.settings.sessionsRevokeOthers}
          </Button>
        )}
      </div>
      {sessions.length === 0 ? (
        <p className="text-xs text-muted-foreground">{d.settings.sessionsEmpty}</p>
      ) : (
        <ul className="space-y-2">
          {sessions.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-2.5">
              <div className="flex items-center gap-2.5 overflow-hidden">
                <Laptop2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="overflow-hidden">
                  <p className="truncate text-xs font-medium">{s.userAgent ?? d.settings.sessionsUnknownDevice}</p>
                  <p className="text-xs tabular-nums text-muted-foreground">
                    {d.settings.sessionsLastActive} {new Date(s.lastUsedAt).toLocaleString()}
                  </p>
                </div>
              </div>
              <Button variant="ghost" size="sm" className="shrink-0 text-destructive hover:text-destructive" disabled={busyId === s.id} onClick={() => revoke(s.id)}>
                {d.settings.sessionsRevoke}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
