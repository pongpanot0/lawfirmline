'use client';

import { useEffect, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { api, ApiError, CalendarEventItem, PublicHolidayItem } from '@/lib/api';
import { calendarPersonColors } from '@/lib/calendar-person-colors';
import { leaveDayEvents } from '@/lib/leave-flags';
import { CalendarView } from '@/components/CalendarView';
import { LoadFailed } from '@/components/ui/LoadFailed';

const dateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** Month grid of who is on leave (approved solid, pending dashed). `reloadKey` refetches after a leave changes. */
export function TeamLeaveCalendar({ token, reloadKey }: { token: string | null; reloadKey: number }) {
  const [month, setMonth] = useState(() => new Date());
  const [events, setEvents] = useState<CalendarEventItem[]>([]);
  const [holidays, setHolidays] = useState<PublicHolidayItem[]>([]);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!token) return;
    let active = true;
    setError('');
    api.getLeaves(token, dateKey(new Date(month.getFullYear(), month.getMonth(), 1)), dateKey(new Date(month.getFullYear(), month.getMonth() + 1, 0)))
      .then((leaves) => { if (active) setEvents(leaveDayEvents(leaves, { includePending: true })); })
      .catch((err) => { if (active) setError(err instanceof ApiError ? err.message : 'โหลดปฏิทินการลาไม่สำเร็จ'); });
    return () => { active = false; };
  }, [token, month, reloadKey, retry]);

  useEffect(() => {
    if (!token) return;
    api.getPublicHolidays(token, month.getFullYear()).then(setHolidays).catch(() => setHolidays([]));
  }, [token, month]);

  const people = new Map<string, string>();
  for (const event of events) if (event.assigneeId) people.set(event.assigneeId, event.title.split(' · ')[1] ?? '');
  const colors = calendarPersonColors([...people.keys()]);
  const personAppearance = (event: { id: string }) => {
    const id = events.find((item) => item.id === event.id)?.assigneeId ?? '';
    return { name: people.get(id) ?? '', color: colors.get(id) ?? '#64748b' };
  };

  return (
    <CalendarView
      events={events}
      holidays={holidays}
      personAppearance={personAppearance}
      month={month}
      onMonthChange={setMonth}
      weekStartsOn={1}
      heading={
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <CalendarDays className="h-5 w-5" aria-hidden />ปฏิทินการลาของทีม
          </h2>
          <p className="text-sm text-muted-foreground">ดูว่าใครลาวันไหนในแต่ละเดือน</p>
        </div>
      }
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm sm:px-6">
          {error ? <LoadFailed message={error} onRetry={() => setRetry((n) => n + 1)} /> : people.size === 0 ? (
            <p className="text-muted-foreground">เดือนนี้ไม่มีใครลา</p>
          ) : (
            <ul className="flex flex-wrap items-center gap-x-4 gap-y-1" aria-label="สมาชิกที่ลาในเดือนนี้">
              <li className="font-medium">สมาชิก:</li>
              {[...people].map(([id, name]) => (
                <li key={id} className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colors.get(id) }} aria-hidden />{name}
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">เส้นทึบ = อนุมัติแล้ว · เส้นประ = รออนุมัติ</p>
        </div>
      }
    />
  );
}
