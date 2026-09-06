'use client';

import { formatDateTime } from '@/lib/utils';
import { useDashboardT, useLocale } from '@/components/landing/LocaleProvider';
import { dateLocale, fmt } from '@/lib/i18n/dashboard';

export interface CalendarEventData {
  id: string;
  title: string;
  description?: string | null;
  startAt: string;
  endAt?: string | null;
  type: string;
  case?: { id: string; ownRef: string; title: string };
}

interface CalendarViewProps {
  events: CalendarEventData[];
  month: Date;
  onMonthChange: (month: Date) => void;
  onDayClick?: (date: Date) => void;
  onEventClick?: (event: CalendarEventData) => void;
}

const typeColors: Record<string, string> = {
  COURT_DATE: 'bg-destructive/10 text-destructive border-destructive/20',
  CLIENT_MEETING: 'bg-primary/10 text-primary border-primary/20',
  DEADLINE: 'bg-warning/10 text-warning border-warning/20',
  OTHER: 'bg-muted text-muted-foreground border-border',
};

export function CalendarView({
  events,
  month,
  onMonthChange,
  onDayClick,
  onEventClick,
}: CalendarViewProps) {
  const d = useDashboardT();
  const { locale } = useLocale();
  const loc = dateLocale(locale);
  const typeLabels: Record<string, string> = {
    COURT_DATE: d.calendar.typeCourtDate,
    CLIENT_MEETING: d.calendar.typeClientMeeting,
    DEADLINE: d.calendar.typeDeadline,
    OTHER: d.calendar.typeOther,
  };
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstDay = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  const days: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(d);

  const monthEvents = events.filter((e) => {
    const d = new Date(e.startAt);
    return d.getFullYear() === year && d.getMonth() === monthIndex;
  });

  const getEventsForDay = (day: number) =>
    monthEvents.filter((e) => new Date(e.startAt).getDate() === day);

  const monthName = month.toLocaleDateString(loc, { month: 'long', year: 'numeric' });
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Date(2026, 0, 4 + i).toLocaleDateString(loc, { weekday: 'short' }),
  );

  const prevMonth = () => onMonthChange(new Date(year, monthIndex - 1, 1));
  const nextMonth = () => onMonthChange(new Date(year, monthIndex + 1, 1));
  const goToday = () => onMonthChange(new Date());

  return (
    <div className="rounded-xl border bg-card shadow-soft">
      <div className="flex items-center justify-between border-b px-6 py-4">
        <h2 className="text-lg font-semibold text-foreground">{monthName}</h2>
        <div className="flex gap-2">
          <button onClick={prevMonth} className="rounded-lg border px-3 py-1 text-sm hover:bg-accent">
            ←
          </button>
          <button onClick={goToday} className="rounded-lg border px-3 py-1 text-sm hover:bg-accent">
            {d.calendar.today}
          </button>
          <button onClick={nextMonth} className="rounded-lg border px-3 py-1 text-sm hover:bg-accent">
            →
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-px bg-border p-px">
        {weekdays.map((w, i) => (
          <div key={i} className="bg-muted px-2 py-2 text-center text-xs font-medium text-muted-foreground">
            {w}
          </div>
        ))}
        {days.map((day, i) => {
          const dayEvents = day ? getEventsForDay(day) : [];
          const isToday =
            day === new Date().getDate() &&
            monthIndex === new Date().getMonth() &&
            year === new Date().getFullYear();

          return (
            <div
              key={i}
              onClick={() => day && onDayClick?.(new Date(year, monthIndex, day))}
              className={`min-h-24 cursor-pointer bg-card p-1 transition hover:bg-accent/50 ${isToday ? 'ring-2 ring-inset ring-primary' : ''}`}
            >
              {day && (
                <>
                  <span
                    className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${isToday ? 'bg-primary font-bold text-primary-foreground' : 'text-foreground'}`}
                  >
                    {day}
                  </span>
                  <div className="mt-1 space-y-0.5">
                    {dayEvents.slice(0, 2).map((e) => (
                      <button
                        key={e.id}
                        type="button"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          onEventClick?.(e);
                        }}
                        className={`block w-full truncate rounded border px-1 py-0.5 text-left text-[10px] hover:opacity-80 ${typeColors[e.type] ?? typeColors.OTHER}`}
                      >
                        {e.title}
                      </button>
                    ))}
                    {dayEvents.length > 2 && (
                      <p className="text-[10px] text-muted-foreground">{fmt(d.calendar.moreCount, { count: dayEvents.length - 2 })}</p>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      <div className="border-t p-4">
        <h3 className="mb-3 text-sm font-semibold text-foreground">{d.calendar.eventsThisMonth}</h3>
        <div className="space-y-2">
          {monthEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">{d.calendar.noEvents}</p>
          ) : (
            monthEvents.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => onEventClick?.(e)}
                className="flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left hover:bg-accent/50"
              >
                <div>
                  <p className="text-sm font-medium">{e.title}</p>
                  {e.case && (
                    <p className="text-xs text-muted-foreground">
                      {e.case.ownRef} — {e.case.title}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(e.startAt)}
                  </p>
                  <span className={`mt-1 inline-block rounded border px-1.5 py-0.5 text-[10px] ${typeColors[e.type] ?? typeColors.OTHER}`}>
                    {typeLabels[e.type] ?? typeLabels.OTHER}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
