'use client';

import type { OutlookCalendarItemDto } from '@lawfirm/shared';
import { outlookDay } from './outlook-day';
import { eventPeopleIds, eventPersonId } from '@/lib/calendar-person-colors';
import { CalendarEventItem, UserItem } from '@/lib/api';
import { InlineEmptyState } from '@/components/ui/misc';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Gavel } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
  filterName, onClearFilter, onAdd, outlookItems = [], selectedOutlook, onOutlookClick,
}: {
  outlookItems?: OutlookCalendarItemDto[]; selectedOutlook?: string; onOutlookClick?: (item: OutlookCalendarItemDto) => void;
  filterName?: string; onClearFilter: () => void; onAdd: () => void;
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

  const upcoming = [...events].sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());

  const days = new Map<string, CalendarEventItem[]>();
  for (const event of upcoming) {
    const key = DAY_KEY.format(new Date(event.startAt));
    days.set(key, [...(days.get(key) ?? []), event]);
  }

  const outlookDays = new Map<string, OutlookCalendarItemDto[]>();
  for (const item of outlookItems) { const key = outlookDay(item); outlookDays.set(key, [...(outlookDays.get(key) ?? []), item]); }
  for (const key of outlookDays.keys()) if (!days.has(key)) days.set(key, []);

  if (days.size === 0) {
    return (
      <InlineEmptyState
        title={filterName ? `ไม่มีนัดของ ${filterName}` : "ยังไม่มีนัดในช่วงนี้"}
        action={<Button variant="outline" title={filterName ? "กดเพื่อดูนัดของทุกคน" : "กดเพื่อเพิ่มนัด"} onClick={filterName ? onClearFilter : onAdd}>{filterName ? "ดูทุกคน" : "เพิ่มนัด"}</Button>}
      />
    );
  }

  return (
    <div className="space-y-5">
      {[...days.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, dayEvents]) => {
        const dayOutlook = outlookDays.get(key) ?? [];
        const clashes = new Set<string>();
        for (let i = 0; i < dayEvents.length; i++) {
          for (let j = i + 1; j < dayEvents.length; j++) {
            const a = dayEvents[i], b = dayEvents[j];
            const aEnd = new Date(a.endAt ?? a.startAt).getTime(), bEnd = new Date(b.endAt ?? b.startAt).getTime();
            const aStart = new Date(a.startAt).getTime(), bStart = new Date(b.startAt).getTime();
            if (eventPeopleIds(a).some(id => eventPeopleIds(b).includes(id)) && (aStart === bStart || (aStart < bEnd && bStart < aEnd))) { clashes.add(a.id); clashes.add(b.id); }
          }
        }

        return (
          <section key={key}>
            <div className="sticky top-0 z-10 mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 bg-background py-2">
              <h3 className="font-semibold text-foreground">
                {DAY.format(new Date(`${key}T00:00:00+07:00`))}
              </h3>
              <span className="text-xs tabular-nums text-muted-foreground">{dayEvents.length} รายการ · จาก Outlook {dayOutlook.length}</span>
              {clashes.size > 0 && (
                <Badge variant="warning" className="gap-1 py-0.5">
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                  เวลาซ้อน {clashes.size} นัด
                </Badge>
              )}
            </div>
            <div className={`overflow-hidden rounded-xl border ${clashes.size ? 'border-red-200 bg-red-50/50' : 'bg-card'}`}>
              {dayOutlook.filter(item => item.isAllDay).map(item => <OutlookRow key={item.id} item={item} selected={selectedOutlook === item.id} onClick={onOutlookClick} />)}
              {dayEvents.map((event, index) => <div key={event.id}>
                {dayOutlook.filter(item => !item.isAllDay && new Date(item.startAt).getTime() < new Date(event.startAt).getTime() && (index === 0 || new Date(item.startAt).getTime() >= new Date(dayEvents[index - 1].startAt).getTime())).map(item => <OutlookRow key={item.id} item={item} selected={selectedOutlook === item.id} onClick={onOutlookClick} />)}
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
                    <span className="block line-clamp-2 font-medium text-foreground">{event.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {event.leaveId ? 'ลางาน' : event.case ? `${event.case.ownRef} · ${event.case.title}` : 'ไม่ผูกกับคดี'}
                      {(event.courtName ?? event.case?.courtName) && <> · <Gavel className="inline h-3.5 w-3.5" aria-hidden /> {event.courtName ?? event.case?.courtName}</>}
                    </span>
                  </span>
                  {(() => {
                    const people = eventPeopleIds(event);
                    const anyClash = clashes.has(event.id);
                    const names = event.assignees?.length
                      ? people.map((id) => nameOf(id)).join(', ')
                      : event.case?.leadLawyer
                        ? `${event.case.leadLawyer.firstName} ${event.case.leadLawyer.lastName} · เจ้าของคดี`
                        : 'ยังไม่ระบุผู้รับผิดชอบ';
                    return (
                      <Badge
                        variant={anyClash ? 'warning' : people.length === 0 ? 'destructive' : 'muted'}
                        className="max-w-36 shrink-0 py-0.5"
                      >
                        {anyClash && <><AlertTriangle className="mr-1 h-3 w-3 shrink-0" aria-hidden />เวลาซ้อน · </>}
                        {names}
                      </Badge>
                    );
                  })()}
                </button></div>
              )}
              {dayOutlook.filter(item => !item.isAllDay && (!dayEvents.length || new Date(item.startAt).getTime() >= new Date(dayEvents[dayEvents.length - 1].startAt).getTime())).map(item => <OutlookRow key={item.id} item={item} selected={selectedOutlook === item.id} onClick={onOutlookClick} />)}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function OutlookRow({ item, selected, onClick }: { item: OutlookCalendarItemDto; selected: boolean; onClick?: (item: OutlookCalendarItemDto) => void }) {
  return <button type="button" onClick={() => onClick?.(item)} className={`m-2 flex w-[calc(100%-1rem)] gap-3 rounded-lg border border-dashed bg-muted/40 p-3 text-left text-sm ${selected ? 'ring-2 ring-primary' : ''}`}><span className="w-12 shrink-0 text-muted-foreground">{item.isAllDay ? 'ทั้งวัน' : TIME.format(new Date(item.startAt))}</span><span><span className="block text-xs text-muted-foreground">Outlook · {item.mailboxAddress.split('@')[0]}</span><span className="font-medium">{item.subject || 'ไม่มีชื่อ'}</span>{item.location && <span className="block text-xs text-muted-foreground">{item.location}</span>}</span></button>;
}
