'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CalendarClock, Car, Check, Gavel, ListTodo, Users } from 'lucide-react';
import { AgendaItemKind, TaskStatus } from '@lawfirm/shared';
import { useAuth, getStoredToken } from '@/lib/auth';
import { api, ApiError, AgendaItem, MyDayResponse } from '@/lib/api';
import { PageHeader } from '@/components/lexflow/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/misc';
import { useDashboardT, useLocale } from '@/components/landing/LocaleProvider';
import { dateLocale, fmt } from '@/lib/i18n/dashboard';
import { bangkokDayLabel, bangkokTime } from '@/lib/bangkok';
import { cn } from '@/lib/utils';

const KIND_ICON = {
  [AgendaItemKind.COURT_DATE]: Gavel,
  [AgendaItemKind.CLIENT_MEETING]: Users,
  [AgendaItemKind.DEADLINE]: CalendarClock,
  [AgendaItemKind.TASK]: ListTodo,
  [AgendaItemKind.OTHER]: CalendarClock,
} as const;

function AgendaRow({
  item,
  onComplete,
  completing,
  viewerId,
}: {
  item: AgendaItem;
  onComplete: (item: AgendaItem) => void;
  completing: boolean;
  viewerId: string | undefined;
}) {
  const d = useDashboardT();
  const Icon = KIND_ICON[item.kind] ?? CalendarClock;
  // An owner or senior sees the team's tasks here; the row says whose it is
  // so "done" is never pressed on someone else's work by mistake.
  const someoneElses = !!item.assigneeId && item.assigneeId !== viewerId;

  return (
    <div className="flex items-start gap-3 rounded-lg border border-transparent px-3 py-2.5 transition hover:border-border hover:bg-muted/50">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <Link href={item.url} className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-mono text-sm tabular-nums text-muted-foreground">
            {item.allDay ? d.myDay.allDay : bangkokTime(item.at)}
          </span>
          <span className="truncate font-medium text-foreground">{item.title}</span>
          {item.caseRef && (
            <span className="font-mono text-xs text-muted-foreground">{item.caseRef}</span>
          )}
          {someoneElses && item.assigneeName && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {fmt(d.myDay.assignedTo, { name: item.assigneeName })}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <span>{d.myDay.kind[item.kind]}</span>
          {item.location && <span>· {item.location}</span>}
          {item.departBy && (
            <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-500">
              <Car className="size-3" aria-hidden />
              {fmt(d.myDay.departBy, { time: bangkokTime(item.departBy) })}
            </span>
          )}
        </div>
      </Link>

      {/*
        Seeing the team's work is the point of this list; finishing it is not.
        A standalone todo belonging to someone else is refused by the API
        anyway, so the button was a dead end as well as a hazard.
      */}
      {item.kind === AgendaItemKind.TASK && !someoneElses && (
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
      )}
    </div>
  );
}

function Section({
  title,
  items,
  tone = 'default',
  onComplete,
  completingId,
  viewerId,
}: {
  title: string;
  items: AgendaItem[];
  tone?: 'default' | 'danger';
  onComplete: (item: AgendaItem) => void;
  completingId: string | null;
  viewerId: string | undefined;
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
                viewerId={viewerId}
                key={item.id}
                item={item}
                onComplete={onComplete}
                completing={completingId === item.id}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * A lawyer's day: what is overdue, what is on today and tomorrow, and what is
 * coming. It loads its own data so it can be dropped anywhere a lawyer lands —
 * its own page, or the home screen for anyone who is not the firm owner.
 */
export function MyDayPanel({ showHeader = true }: { showHeader?: boolean }) {
  const { token, user } = useAuth();
  const viewerId = user?.id;
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
        {showHeader && <PageHeader title={d.myDay.title} description={d.myDay.description} />}
        <p role="alert" className="text-sm text-destructive">{error}</p>
        <Button size="sm" variant="outline" onClick={load}>
          {d.common.retry}
        </Button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-4">
      {showHeader && <PageHeader title={d.myDay.title} description={d.myDay.description} />}

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
          viewerId={viewerId}
        />
      )}
      <Section
        title={d.myDay.today}
        items={data.todayItems}
        onComplete={handleComplete}
        completingId={completingId}
        viewerId={viewerId}
      />
      <Section
        title={d.myDay.tomorrow}
        items={data.tomorrow}
        onComplete={handleComplete}
        completingId={completingId}
        viewerId={viewerId}
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
                      viewerId={viewerId}
                      key={item.id}
                      item={item}
                      onComplete={handleComplete}
                      completing={completingId === item.id}
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
