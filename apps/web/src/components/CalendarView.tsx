'use client';

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
  COURT_DATE: 'bg-red-100 text-red-800 border-red-200',
  CLIENT_MEETING: 'bg-blue-100 text-blue-800 border-blue-200',
  DEADLINE: 'bg-amber-100 text-amber-800 border-amber-200',
  OTHER: 'bg-slate-100 text-slate-700 border-slate-200',
};

export function CalendarView({
  events,
  month,
  onMonthChange,
  onDayClick,
  onEventClick,
}: CalendarViewProps) {
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

  const monthName = month.toLocaleString('default', { month: 'long', year: 'numeric' });

  const prevMonth = () => onMonthChange(new Date(year, monthIndex - 1, 1));
  const nextMonth = () => onMonthChange(new Date(year, monthIndex + 1, 1));
  const goToday = () => onMonthChange(new Date());

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
        <h2 className="text-lg font-semibold text-slate-900">{monthName}</h2>
        <div className="flex gap-2">
          <button onClick={prevMonth} className="rounded-lg border border-slate-200 px-3 py-1 text-sm hover:bg-slate-50">
            ←
          </button>
          <button onClick={goToday} className="rounded-lg border border-slate-200 px-3 py-1 text-sm hover:bg-slate-50">
            Today
          </button>
          <button onClick={nextMonth} className="rounded-lg border border-slate-200 px-3 py-1 text-sm hover:bg-slate-50">
            →
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-px bg-slate-200 p-px">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} className="bg-slate-50 px-2 py-2 text-center text-xs font-medium text-slate-500">
            {d}
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
              className={`min-h-24 cursor-pointer bg-white p-1 transition hover:bg-brand-50/50 ${isToday ? 'ring-2 ring-inset ring-brand-500' : ''}`}
            >
              {day && (
                <>
                  <span
                    className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${isToday ? 'bg-brand-600 font-bold text-white' : 'text-slate-700'}`}
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
                      <p className="text-[10px] text-slate-400">+{dayEvents.length - 2} more</p>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      <div className="border-t border-slate-200 p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">Events this month</h3>
        <div className="space-y-2">
          {monthEvents.length === 0 ? (
            <p className="text-sm text-slate-400">No events — click a day to add one</p>
          ) : (
            monthEvents.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => onEventClick?.(e)}
                className="flex w-full items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-left hover:bg-slate-50"
              >
                <div>
                  <p className="text-sm font-medium">{e.title}</p>
                  {e.case && (
                    <p className="text-xs text-slate-500">
                      {e.case.ownRef} — {e.case.title}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500">
                    {new Date(e.startAt).toLocaleDateString()}{' '}
                    {new Date(e.startAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                  <span className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] ${typeColors[e.type] ?? typeColors.OTHER}`}>
                    {e.type.replace('_', ' ')}
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
