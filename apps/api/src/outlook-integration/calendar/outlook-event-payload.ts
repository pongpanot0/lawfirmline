import { GraphEventInput } from '../graph/graph-calendar.client';

export type PayloadEvent = {
  id: string; title: string; description: string | null; courtName: string | null;
  startAt: Date; endAt: Date | null; type: string; reminderMinutes: number[];
  onlineMeetingUrl?: string | null;
  case: { ownRef: string; title: string; blackCaseNumber: string | null; redCaseNumber: string | null };
};

const PREFIX: Record<string, string> = { COURT_DATE: '[นัดศาล] ', CLIENT_MEETING: '[นัดลูกความ] ', DEADLINE: '[ครบกำหนด] ' };
const DEFAULT_MINUTES: Record<string, number> = { DEADLINE: 30 };

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const utc = (d: Date) => ({ dateTime: d.toISOString().replace('Z', ''), timeZone: 'UTC' as const });

export function buildOutlookEvent(e: PayloadEvent, opts: { caseUrl: string; transactionId: string }): GraphEventInput {
  const end = e.endAt ?? new Date(e.startAt.getTime() + (DEFAULT_MINUTES[e.type] ?? 60) * 60_000);
  const refs = [e.case.ownRef, e.case.blackCaseNumber && `คดีดำ ${e.case.blackCaseNumber}`, e.case.redCaseNumber && `คดีแดง ${e.case.redCaseNumber}`]
    .filter(Boolean)
    .join(' · ');
  const lines = [
    `<p><b>${esc(e.case.title)}</b><br>${esc(refs)}</p>`,
    e.onlineMeetingUrl ? `<p>เข้าร่วม Teams: <a href="${esc(e.onlineMeetingUrl)}">${esc(e.onlineMeetingUrl)}</a></p>` : '',
    e.description ? `<p>${esc(e.description).replace(/\n/g, '<br>')}</p>` : '',
    `<p><a href="${esc(opts.caseUrl)}">เปิดคดีใน Samnuan</a></p>`,
    `<p style="color:#888">นัดนี้ซิงก์จาก Samnuan — แก้ไขในระบบ การแก้ใน Outlook จะถูกเขียนทับ</p>`,
  ];
  const reminder = e.reminderMinutes.length ? Math.min(...e.reminderMinutes) : 0;
  return {
    subject: `${PREFIX[e.type] ?? ''}${e.title}`,
    body: { contentType: 'HTML', content: lines.filter(Boolean).join('') },
    start: utc(e.startAt),
    end: utc(end),
    ...(e.courtName ? { location: { displayName: e.courtName } } : {}),
    categories: ['Samnuan'],
    showAs: 'busy',
    isReminderOn: e.reminderMinutes.length > 0,
    reminderMinutesBeforeStart: reminder,
    transactionId: opts.transactionId,
  };
}
