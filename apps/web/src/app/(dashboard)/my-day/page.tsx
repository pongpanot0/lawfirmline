'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Check } from 'lucide-react';
import { AgendaItemKind, TaskStatus } from '@lawfirm/shared';
import { useAuth, getStoredToken } from '@/lib/auth';
import { api, ApiError, AgendaItem, MyDayResponse } from '@/lib/api';
import { AgendaRow } from '@/components/lexflow/AgendaRow';
import { PageHeader } from '@/components/lexflow/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/misc';
import { useDashboardT, useLocale } from '@/components/landing/LocaleProvider';
import { dateLocale } from '@/lib/i18n/dashboard';
import { bangkokDayLabel } from '@/lib/bangkok';
import { cn } from '@/lib/utils';

/** Only a task can be finished from the agenda; events are not the lawyer's to close. */
function MarkDoneButton({
  item,
  onComplete,
  completing,
}: {
  item: AgendaItem;
  onComplete: (item: AgendaItem) => void;
  completing: boolean;
}) {
  const d = useDashboardT();
  if (item.kind !== AgendaItemKind.TASK) return null;

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="shrink-0"
      disabled={completing}
      onClick={() => onComplete(item)}
    >
      <Check className="size-3.5" aria-hidden />
      {d.myDay.markDone}
    </Button>
  );
}

function Section({
  title,
  items,
  tone = 'default',
  onComplete,
  completingId,
}: {
  title: string;
  items: AgendaItem[];
  tone?: 'default' | 'danger';
  onComplete: (item: AgendaItem) => void;
  completingId: string | null;
}) {
  const d = useDashboardT();
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle
          className={cn('text-base', tone === 'danger' && 'text-destructive')}
        >
          {title}
          <span className="ml-2 text-sm font-normal text-muted-foreground">{items.length}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {items.length === 0 ? (
          <p className="px-3 py-2 text-sm text-muted-foreground">{d.myDay.empty}</p>
        ) : (
          <div className="-mx-1 divide-y divide-border/60">
            {items.map((item) => (
              <AgendaRow
                key={item.id}
                item={item}
                action={
                  <MarkDoneButton
                    item={item}
                    onComplete={onComplete}
                    completing={completingId === item.id}
                  />
                }
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function MyDayPage() {
  const { token } = useAuth();
  const { locale, d } = useLocale();
  const [data, setData] = useState<MyDayResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [completingId, setCompletingId] = useState<string | null>(null);

  const load = useCallback(() => {
    const authToken = token ?? getStoredToken();
    if (!authToken) {
      setLoading(false);
      return;
    }
    setError('');
    api
      .getMyDay(authToken)
      .then(setData)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) return;
        setError(err instanceof Error ? err.message : d.common.loadFailed);
      })
      .finally(() => setLoading(false));
  }, [token, d.common.loadFailed]);

  useEffect(() => {
    load();
  }, [load]);

  const handleComplete = async (item: AgendaItem) => {
    const authToken = token ?? getStoredToken();
    if (!authToken) return;
    setCompletingId(item.id);
    setError('');
    try {
      // A task on a case and a standalone todo are the same record behind two
      // routes; `caseId` is what says which one to call.
      if (item.caseId) {
        await api.updateTask(authToken, item.caseId, item.entityId, { status: TaskStatus.DONE });
      } else {
        await api.updateTodo(authToken, item.entityId, { status: TaskStatus.DONE });
      }
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : d.myDay.markDoneFailed);
    } finally {
      setCompletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-40" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title={d.myDay.title} description={d.myDay.description} />
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-4">
      <PageHeader title={d.myDay.title} description={d.myDay.description} />

      {data.warnings.length > 0 && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-amber-700 dark:text-amber-500">
              <AlertTriangle className="size-4" aria-hidden />
              {d.myDay.conflicts}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="space-y-1 text-sm text-foreground">
              {data.warnings.map((warning, i) => (
                <li key={`${warning.kind}-${i}`}>{warning.message}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {data.overdue.length > 0 && (
        <Section
          title={d.myDay.overdue}
          items={data.overdue}
          tone="danger"
          onComplete={handleComplete}
          completingId={completingId}
        />
      )}
      <Section
        title={d.myDay.today}
        items={data.todayItems}
        onComplete={handleComplete}
        completingId={completingId}
      />
      <Section
        title={d.myDay.tomorrow}
        items={data.tomorrow}
        onComplete={handleComplete}
        completingId={completingId}
      />

      {data.upcoming.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{d.myDay.upcoming}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-0">
            {data.upcoming.map((day) => (
              <div key={day.date}>
                <p className="px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {bangkokDayLabel(day.date, dateLocale(locale))}
                </p>
                <div className="-mx-1 divide-y divide-border/60">
                  {day.items.map((item) => (
                    <AgendaRow
                      key={item.id}
                      item={item}
                      action={
                        <MarkDoneButton
                          item={item}
                          onComplete={handleComplete}
                          completing={completingId === item.id}
                        />
                      }
                    />
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
