'use client';

import { AlertTriangle } from 'lucide-react';
import { CalendarEventItem } from '@/lib/api';
import { useDashboardT } from '@/components/landing/LocaleProvider';
import { fmt } from '@/lib/i18n/dashboard';

/** A gap this long between consecutive events gets flagged — the lawyer
 * decides whether it means anything (spec: show the gap, never interpret it). */
const GAP_WARNING_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export function CaseTimelineView({
  events,
  onEventClick,
}: {
  events: CalendarEventItem[];
  onEventClick: (event: CalendarEventItem) => void;
}) {
  const d = useDashboardT();
  const sorted = [...events].sort(
    (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
  );

  if (!sorted.length) {
    return (
      <div className="rounded-xl border bg-card p-6 shadow-soft">
        <p className="text-sm text-muted-foreground">{d.caseCalendar.emptyTimeline}</p>
      </div>
    );
  }

  const now = Date.now();
  return (
    <div className="rounded-xl border bg-card p-6 shadow-soft">
      <ol className="relative ml-3 border-l border-border">
        {sorted.map((event, i) => {
          const start = new Date(event.startAt);
          const gapDays =
            i > 0
              ? Math.round((start.getTime() - new Date(sorted[i - 1].startAt).getTime()) / DAY_MS)
              : 0;
          const past = start.getTime() < now;
          return (
            <li key={event.id} className="mb-6 ml-6 last:mb-0">
              {gapDays >= GAP_WARNING_DAYS && (
                <p className="-ml-6 mb-4 flex items-center gap-1.5 pl-6 text-xs text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  {fmt(d.caseCalendar.gapDays, { days: gapDays })}
                </p>
              )}
              <span
                className={`absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full ${past ? 'bg-muted-foreground' : 'bg-primary'}`}
                aria-hidden
              />
              <button
                type="button"
                onClick={() => onEventClick(event)}
                className="block w-full rounded-md p-1 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <time className="text-xs font-medium text-muted-foreground">
                  {start.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}
                </time>
                <p className="text-sm font-semibold text-foreground">{event.title}</p>
                {event.courtName && <p className="text-xs text-muted-foreground">{event.courtName}</p>}
                {event.description && (
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{event.description}</p>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
