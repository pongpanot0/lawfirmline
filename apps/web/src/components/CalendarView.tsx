'use client';

import type { CSSProperties } from 'react';
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
  /** Public holidays; days matching get a tint and the holiday name. */
  personAppearance?: (event: CalendarEventData) => { name: string; color: string };
  holidays?: { date: string; name: string }[];
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
  LEAVE: 'bg-violet-100 text-violet-800 border-violet-200',
};

export function CalendarView({
  events,
  holidays = [],
  personAppearance,
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
    LEAVE: 'ลางาน',
  };
  const personStyle = (event: CalendarEventData): CSSProperties | undefined => personAppearance ? { borderLeft: `4px solid ${personAppearance(event).color}`, backgroundColor: `color-mix(in srgb, ${personAppearance(event).color} 10%, transparent)` } : undefined;
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

  const holidayByDay = new Map<number, string>();
  for (const h of holidays) {
    const hd = new Date(h.date);
    if (hd.getFullYear() === year && hd.getMonth() === monthIndex) holidayByDay.set(hd.getDate(), h.name);
  }

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
          <div
            key={i}
            className={`px-2 py-2 text-center text-xs font-medium ${i === 0 || i === 6 ? 'bg-rose-50/60 text-rose-500 dark:bg-rose-950/20 dark:text-rose-400' : 'bg-muted text-muted-foreground'}`}
          >
            {w}
          </div>
        ))}
        {days.map((day, i) => {
          const dayEvents = day ? getEventsForDay(day) : [];
          const holidayName = day ? holidayByDay.get(day) : undefined;
          const isToday =
            day === new Date().getDate() &&
            monthIndex === new Date().getMonth() &&
            year === new Date().getFullYear();

          return (
            <div
              key={i}
              onClick={() => day && onDayClick?.(new Date(year, monthIndex, day))}
              className={`min-h-24 cursor-pointer p-1.5 transition hover:bg-accent/50 ${holidayName ? 'bg-rose-50 dark:bg-rose-950/20' : i % 7 === 0 || i % 7 === 6 ? 'bg-muted/40' : 'bg-card'} ${isToday ? 'ring-2 ring-inset ring-primary' : ''}`}
            >
              {day && (
                <>
                  {/*
                    The whole cell is clickable for the mouse, but a nested
                    button would be invalid markup — so the day number carries
                    the keyboard affordance for adding an event.
                  */}
                  <button
                    type="button"
                    disabled={!onDayClick}
                    aria-label={onDayClick ? fmt(d.calendar.addOnDay, { day }) : undefined}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      onDayClick?.(new Date(year, monthIndex, day));
                    }}
                    className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs disabled:cursor-default ${isToday ? 'bg-primary font-bold text-primary-foreground' : 'text-foreground'}`}
                  >
                    {day}
                  </button>
                  {holidayName && (
                    <p className="mt-0.5 truncate text-[10px] font-medium text-rose-600 dark:text-rose-400" title={holidayName}>
                      {holidayName}
                    </p>
                  )}
                  <div className="mt-1 space-y-0.5">
                    {dayEvents.slice(0, 2).map((e) => (
                      <button
                        key={e.id}
                        type="button"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          onEventClick?.(e);
                        }}
                        style={personStyle(e)}
                        title={personAppearance ? `${personAppearance(e).name} · ${e.title}` : e.title}
                        className={`block w-full truncate rounded border px-1 py-0.5 text-left text-[10px] hover:opacity-80 ${personAppearance ? 'bg-muted/50 text-foreground border-border' : typeColors[e.type] ?? typeColors.OTHER}`}
                      >
                        {personAppearance && <span className="block truncate font-semibold">{personAppearance(e).name}</span>}{e.title}
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
                style={personStyle(e)}
                className="flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left hover:bg-accent/50"
              >
                <div>
                  <p className="text-sm font-medium">{e.title}</p>{personAppearance && <p className="text-xs font-medium">{personAppearance(e).name}</p>}
                  {e.case && (
                    <p className="text-xs text-muted-foreground">
                      {e.case.ownRef} — {e.case.title}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">
                    {e.type === 'LEAVE' ? 'ทั้งวัน' : formatDateTime(e.startAt)}
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
