'use client';

import { eventPersonId } from '@/lib/calendar-person-colors';
import { CalendarEventItem, UserItem } from '@/lib/api';
import { InlineEmptyState } from '@/components/ui/misc';

const DAY = new Intl.DateTimeFormat('th-TH', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Asia/Bangkok',
});
const TIME = new Intl.DateTimeFormat('th-TH', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Bangkok',
});
const DAY_KEY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' });

/**
 * ตารางของทั้งสำนักงานเรียงเป็นวัน — เจ้าของสำนักงานต้องเห็นว่าวันนั้นใครไปไหนบ้าง
 * ปฏิทินเดือนบอกได้แค่ว่ามีนัด แต่ไม่บอกว่าคนคนเดียวถูกจองซ้อนกัน
 */
export function FirmDayAgenda({
  events,
  users,
  onEventClick,
  personColors,
}: {
  personColors?: Map<string, string>;
  events: CalendarEventItem[];
  users: UserItem[];
  onEventClick: (event: CalendarEventItem) => void;
}) {
  const nameOf = (id?: string | null) => {
    if (!id) return 'ยังไม่ระบุผู้รับผิดชอบ';
    const user = users.find((u) => u.id === id);
    return user ? `${user.firstName} ${user.lastName}` : 'ยังไม่ระบุผู้รับผิดชอบ';
  };

  // ตั้งแต่ต้นวันนี้เป็นต้นไป — นัดที่ผ่านไปแล้วไม่ใช่สิ่งที่ต้องจัดคน
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const upcoming = events
    .filter((e) => new Date(e.startAt) >= startOfToday)
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());

  const days = new Map<string, CalendarEventItem[]>();
  for (const event of upcoming) {
    const key = DAY_KEY.format(new Date(event.startAt));
    days.set(key, [...(days.get(key) ?? []), event]);
  }

  if (days.size === 0) {
    return (
      <InlineEmptyState
        title="ไม่มีนัดที่จะถึง"
        description="นัดศาลและนัดลูกความของทั้งสำนักงานจะเรียงเป็นรายวันตรงนี้"
      />
    );
  }

  return (
    <div className="space-y-5">
      {[...days.entries()].map(([key, dayEvents]) => {
        // คนเดียวมีมากกว่าหนึ่งนัดในวันเดียว = ต้องมองก่อนเพื่อน
        const perPerson = new Map<string, number>();
        for (const e of dayEvents) {
          const who = e.assigneeId ?? e.case?.leadLawyer?.id ?? 'unassigned';
          perPerson.set(who, (perPerson.get(who) ?? 0) + 1);
        }
        const clashing = new Set(
          [...perPerson.entries()].filter(([who, n]) => n > 1 && who !== 'unassigned').map(([who]) => who),
        );

        return (
          <section key={key}>
            <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h3 className="font-semibold text-foreground">
                {DAY.format(new Date(`${key}T00:00:00+07:00`))}
              </h3>
              <span className="text-xs text-muted-foreground">{dayEvents.length} รายการ</span>
              {clashing.size > 0 && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                  {clashing.size} คนมีนัดซ้อน
                </span>
              )}
            </div>
            <div className="overflow-hidden rounded-xl border">
              {dayEvents.map((event, index) => (
                <button
                  key={event.id}
                  type="button"
                  style={{ borderLeft: `4px solid ${personColors?.get(eventPersonId(event) ?? '') ?? '#64748b'}` }}
                  onClick={() => onEventClick(event)}
                  className={`flex w-full items-start gap-3 px-3 py-2.5 text-left text-sm hover:bg-muted/60 ${
                    index > 0 ? 'border-t' : ''
                  }`}
                >
                  <span className="w-12 shrink-0 tabular-nums text-muted-foreground">
                    {event.leaveId ? 'ทั้งวัน' : TIME.format(new Date(event.startAt))}
                  </span>
                  <span
                    style={{ backgroundColor: personColors?.get(eventPersonId(event) ?? '') ?? '#64748b' }}
                    className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-foreground">{event.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {event.leaveId ? 'ลางาน' : event.case ? `${event.case.ownRef} · ${event.case.title}` : 'ไม่ผูกกับคดี'}
                      {(event.courtName ?? event.case?.courtName) &&
                        ` · ${event.courtName ?? event.case?.courtName}`}
                    </span>
                  </span>
                  <span
                    className={`max-w-36 rounded-full px-2 py-0.5 text-xs ${
                      clashing.has(event.assigneeId ?? event.case?.leadLawyer?.id ?? '')
                        ? 'bg-amber-100 font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                        : !event.assigneeId && !event.case?.leadLawyer
                          ? 'bg-red-100 font-medium text-red-800 dark:bg-red-950 dark:text-red-300'
                          : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {event.assigneeId ? nameOf(event.assigneeId) : event.case?.leadLawyer ? `${event.case.leadLawyer.firstName} ${event.case.leadLawyer.lastName} · เจ้าของคดี` : 'ยังไม่ระบุผู้รับผิดชอบ'}
                  </span>
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
