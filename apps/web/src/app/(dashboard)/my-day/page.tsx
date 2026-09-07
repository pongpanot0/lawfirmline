'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CalendarClock, Car, Gavel, ListTodo, Users } from 'lucide-react';
import { AgendaItemKind } from '@lawfirm/shared';
import { useAuth, getStoredToken } from '@/lib/auth';
import { api, ApiError, AgendaItem, MyDayResponse } from '@/lib/api';
import { PageHeader } from '@/components/lexflow/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/misc';
import { useDashboardT, useLocale } from '@/components/landing/LocaleProvider';
import { dateLocale, fmt } from '@/lib/i18n/dashboard';
import { cn } from '@/lib/utils';

const KIND_ICON = {
  [AgendaItemKind.COURT_DATE]: Gavel,
  [AgendaItemKind.CLIENT_MEETING]: Users,
  [AgendaItemKind.DEADLINE]: CalendarClock,
  [AgendaItemKind.TASK]: ListTodo,
  [AgendaItemKind.OTHER]: CalendarClock,
} as const;

/**
 * The API returns instants; the firm reads them in Bangkok time, so the zone is
 * pinned here too rather than following the viewer's device.
 */
function bangkokTime(iso: string) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

function bangkokDayLabel(dayKey: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(`${dayKey}T00:00:00Z`));
}

function AgendaRow({ item }: { item: AgendaItem }) {
  const d = useDashboardT();
  const Icon = KIND_ICON[item.kind] ?? CalendarClock;

  return (
    <Link
      href={item.url}
      className="flex items-start gap-3 rounded-lg border border-transparent px-3 py-2.5 transition hover:border-border hover:bg-muted/50"
    >
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-mono text-sm tabular-nums text-muted-foreground">
            {item.allDay ? d.myDay.allDay : bangkokTime(item.at)}
          </span>
          <span className="truncate font-medium text-foreground">{item.title}</span>
          {item.caseRef && (
            <span className="font-mono text-xs text-muted-foreground">{item.caseRef}</span>
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
      </div>
    </Link>
  );
}

function Section({
  title,
  items,
  tone = 'default',
}: {
  title: string;
  items: AgendaItem[];
  tone?: 'default' | 'danger';
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
              <AgendaRow key={item.id} item={item} />
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

  useEffect(() => {
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
        <Section title={d.myDay.overdue} items={data.overdue} tone="danger" />
      )}
      <Section title={d.myDay.today} items={data.todayItems} />
      <Section title={d.myDay.tomorrow} items={data.tomorrow} />

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
                    <AgendaRow key={item.id} item={item} />
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
