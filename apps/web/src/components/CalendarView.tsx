'use client';

import type { CSSProperties, ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
  /** Leave day still awaiting approval: drawn with a dashed border. */
  leavePending?: boolean;
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
  /** 0 = Sunday-first (default), 1 = Monday-first. */
  weekStartsOn?: 0 | 1;
  /** Replaces the month name on the left of the header; the month name then sits between the arrows. */
  heading?: ReactNode;
  /** Replaces the "events this month" list under the grid. */
  footer?: ReactNode;
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
  weekStartsOn = 0,
  heading,
  footer,
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
  const personStyle = (event: CalendarEventData): CSSProperties | undefined => personAppearance ? { borderLeft: `4px ${event.leavePending ? 'dashed' : 'solid'} ${personAppearance(event).color}`, backgroundColor: `color-mix(in srgb, ${personAppearance(event).color} ${event.leavePending ? 5 : 10}%, transparent)`, ...(event.leavePending && { borderStyle: 'dashed' }) } : undefined;
  const isWeekend = (column: number) => (column + weekStartsOn) % 7 === 0 || (column + weekStartsOn) % 7 === 6;
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstDay = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  const days: (number | null)[] = [];
  for (let i = 0; i < (firstDay - weekStartsOn + 7) % 7; i++) days.push(null);
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
    new Date(2026, 0, 4 + weekStartsOn + i).toLocaleDateString(loc, { weekday: 'short' }),
  );

  const prevMonth = () => onMonthChange(new Date(year, monthIndex - 1, 1));
  const nextMonth = () => onMonthChange(new Date(year, monthIndex + 1, 1));
  const goToday = () => onMonthChange(new Date());

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 sm:px-6">
        {heading ?? <h2 className="text-lg font-semibold text-foreground">{monthName}</h2>}
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="icon" onClick={prevMonth} aria-label={locale === 'th' ? 'เดือนก่อน' : 'Previous month'}>
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </Button>
          {heading ? <span className="min-w-32 text-center text-sm font-semibold text-foreground" aria-live="polite">{monthName}</span> : (
            <Button type="button" variant="outline" size="sm" onClick={goToday}>
              {d.calendar.today}
            </Button>
          )}
          <Button type="button" variant="outline" size="icon" onClick={nextMonth} aria-label={locale === 'th' ? 'เดือนถัดไป' : 'Next month'}>
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Button>
          {heading && (
            <Button type="button" variant="outline" size="sm" onClick={goToday}>
              {d.calendar.today}
            </Button>
          )}
        </div>
      </div>
      <div className="grid grid-cols-7 gap-px bg-border p-px">
        {weekdays.map((w, i) => (
          <div
            key={i}
            className={`px-2 py-2 text-center text-xs font-medium ${isWeekend(i) ? 'bg-rose-50/60 text-rose-500 dark:bg-rose-950/20 dark:text-rose-400' : 'bg-muted text-muted-foreground'}`}
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
              className={`min-h-24 p-1.5 transition ${onDayClick ? 'cursor-pointer hover:bg-accent/50' : ''} ${holidayName ? 'bg-rose-50 dark:bg-rose-950/20' : isWeekend(i % 7) ? 'bg-muted/40' : 'bg-card'} ${isToday ? 'ring-2 ring-inset ring-primary' : ''}`}
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
                        title={`${e.leavePending ? 'รออนุมัติ · ' : ''}${personAppearance && e.type !== 'LEAVE' ? `${personAppearance(e).name} · ` : ''}${e.title}`}
                        className={`block w-full truncate rounded border px-1 py-0.5 text-left text-xs hover:opacity-80 ${personAppearance ? 'bg-muted/50 text-foreground border-border' : typeColors[e.type] ?? typeColors.OTHER}`}
                      >
                        {/* Leave titles already carry the person's name. */}
                        {personAppearance && e.type !== 'LEAVE' && <span className="block truncate font-semibold">{personAppearance(e).name}</span>}{e.leavePending && 'รออนุมัติ · '}{e.title}
                      </button>
                    ))}
                    {dayEvents.length > 2 && (
                      <p className="text-[10px] text-muted-foreground">+{dayEvents.length - 2}{dayEvents.every((e) => e.type === 'LEAVE') && ' คน'}</p>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {footer !== undefined ? footer : <div className="border-t p-4">
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
      </div>}
    </div>
  );
}
