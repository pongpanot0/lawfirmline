'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { CalendarClock, Car, Gavel, ListTodo, Users } from 'lucide-react';
import { AgendaItemKind } from '@lawfirm/shared';
import type { AgendaItem } from '@/lib/api';
import { useDashboardT } from '@/components/landing/LocaleProvider';
import { fmt } from '@/lib/i18n/dashboard';
import { bangkokTime } from '@/lib/bangkok';

const KIND_ICON = {
  [AgendaItemKind.COURT_DATE]: Gavel,
  [AgendaItemKind.CLIENT_MEETING]: Users,
  [AgendaItemKind.DEADLINE]: CalendarClock,
  [AgendaItemKind.TASK]: ListTodo,
  [AgendaItemKind.OTHER]: CalendarClock,
} as const;

/**
 * One line of the agenda. Shared by My Day and the home page so a court date
 * reads the same wherever it surfaces; `action` is what each screen lets the
 * lawyer *do* with it, which is the only part that differs.
 */
export function AgendaRow({ item, action }: { item: AgendaItem; action?: ReactNode }) {
  const d = useDashboardT();
  const Icon = KIND_ICON[item.kind] ?? CalendarClock;

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
      {action}
    </div>
  );
}
