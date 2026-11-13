import { dailyUpdateParts, HEAVY_QUEUE_POINTS, TeamRadarMember } from '@lawfirm/shared';
import {
  addBangkokDays, bangkokDayDiff, formatBangkokDateThai, isBangkokWeekend,
} from '../common/utils/bangkok-time';

export const NEWCOMER_DAYS = 30;
export interface TeamDigestTask {
  assigneeId: string | null;
  status: string;
  blocker: string | null;
  holdReason: string | null;
  blockedBy: string | null;
  case: { ownRef: string } | null;
}
export interface TeamDigestBoard {
  members: { userId: string; firstName: string; lastName: string; role: string; onLeave: boolean }[];
  tasks: TeamDigestTask[];
}
export interface TeamDigestInput {
  today: Date;
  board: TeamDigestBoard;
  firmName: string;
  updates: { authorId: string; body: string; caseRef: string | null }[];
  radar: { members: TeamRadarMember[] };
  joins: { userId: string; createdAt: Date }[];
  appUrl: string;
}
export interface TeamDigest {
  summary: string;
  lines: string[];
  text: string;
  memberCount: number;
}

export function previousWorkingDay(today: Date): Date {
  // ponytail: public holidays are ignored; add a firm holiday calendar when required.
  let day = addBangkokDays(today, -1);
  while (isBangkokWeekend(day)) day = addBangkokDays(day, -1);
  return day;
}

function field(value: string): string {
  const text = value.replace(/\s+/g, ' ').trim();
  return text.length > 80 ? `${text.slice(0, 79)}…` : text;
}
function capped(lines: string[]): string[] {
  return [...lines.slice(0, 3), ...(lines.length > 3 ? [`…และอีก ${lines.length - 3} งาน`] : [])];
}

export function buildTeamDigest(input: TeamDigestInput): TeamDigest {
  const previous = previousWorkingDay(input.today);
  const updateDay = bangkokDayDiff(previous, input.today) === 1
    ? 'เมื่อวาน'
    : new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', weekday: 'long' }).format(previous);
  const members = input.board.members.filter(m => m.role !== 'EXTERNAL').map(member => {
    const radar = input.radar.members.find(m => m.userId === member.userId);
    // ponytail: drop the cast once standardPoints lands in shared.
    const standard = radar ? (radar as TeamRadarMember & { standardPoints?: number }).standardPoints ?? HEAVY_QUEUE_POINTS : HEAVY_QUEUE_POINTS;
    const points = radar?.openPoints ?? 0;
    const overdue = radar?.overdueCount ?? 0;
    const joined = input.joins.find(m => m.userId === member.userId);
    const days = joined ? bangkokDayDiff(joined.createdAt, input.today) : -1;
    const newcomer = days >= 0 && days < NEWCOMER_DAYS;
    const open = input.board.tasks.filter(t => t.assigneeId === member.userId && !['DONE', 'PENDING_REVIEW'].includes(t.status));
    const updates = input.updates.filter(update => update.authorId === member.userId);
    const onLeave = member.onLeave || !!radar?.days[0]?.onLeave;
    const missing = !onLeave && open.length > 0 && updates.length === 0;
    const over = points > standard;
    const name = `${newcomer ? '🆕 ' : ''}${field(member.firstName)} ${field(member.lastName)}${newcomer ? ` (เข้าใหม่ ${days} วัน)` : ''}`;
    const lines = [name];
    if (onLeave) lines.push('🏖️ ลาวันนี้');
    else {
      lines.push(`${points === 0 ? 'ว่าง' : `คิว ${points}/${standard} แต้ม${over ? ' ⚠️ เกินเกณฑ์' : ''}`}${overdue ? ` · เลยกำหนด ${overdue} งาน` : ''}`);
      lines.push(...capped(updates.map(t => {
        const parts = dailyUpdateParts(t.body);
        return `✅ ${field(parts.completed)}${parts.remaining ? `  ⏭ ${field(parts.remaining)}` : ''}`;
      })));
      lines.push(...capped(open.filter(t => t.blocker || t.holdReason || t.blockedBy).map(t =>
        `⛔ ${field(t.blocker || t.holdReason || `รอ: ${t.blockedBy}`)}${t.case ? ` [${field(t.case.ownRef)}]` : ''}`)));
      if (missing) lines.push(`⚠️ ไม่ได้อัปเดตงาน${updateDay}`);
    }
    return { member, newcomer, over, overdue, missing, lines,
      urgency: over ? 0 : overdue ? 1 : missing ? 2 : 3 };
  }).sort((a, b) => Number(b.newcomer) - Number(a.newcomer) || a.urgency - b.urgency || a.member.firstName.localeCompare(b.member.firstName, 'th'));
  const summary = `เกินเกณฑ์ ${members.filter(m => m.over).length} คน · เลยกำหนด ${members.reduce((n, m) => n + m.overdue, 0)} งาน · ไม่ได้อัปเดต ${members.filter(m => m.missing).length} คน · คนใหม่ ${members.filter(m => m.newcomer).length} คน`;
  const header = [`📋 สรุปทีมประจำวัน ${field(input.firmName)} ${formatBangkokDateThai(input.today)}`, summary];
  const footer = `ดูรายละเอียดในแอป: ${input.appUrl}/operations`;
  const lines = [...header, ...members.flatMap(m => ['', ...m.lines]), '', footer];
  const shown = [...header];
  for (let i = 0; i < members.length; i++) {
    const candidate = [...shown, '', ...members[i].lines];
    const suffix = i < members.length - 1 ? ['', '…ดูต่อในแอป', footer] : ['', footer];
    if ([...candidate, ...suffix].join('\n').length > 5000) {
      shown.push('', '…ดูต่อในแอป');
      break;
    }
    shown.push('', ...members[i].lines);
  }
  return { summary, lines, text: [...shown, '', footer].join('\n'), memberCount: members.length };
}
