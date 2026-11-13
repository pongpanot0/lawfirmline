import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser, StandupEntry, StandupState, StandupToday, TaskRef, standupRequired } from '@lawfirm/shared';
import { DailyStandup } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.module';
import { assertFirmRefs, firmTaskScope } from '../common/firm-refs';
import { bangkokDayKey } from '../common/utils/bangkok-time';
import { StandupDto } from './dto/coaching.dto';

const DAY_MS = 86400000;
const taskSelect = { id: true, title: true, case: { select: { ownRef: true } } } as const;
export const taskRef = (task: { id: string; title: string; case: { ownRef: string } | null }): TaskRef => ({ id: task.id, title: task.title, caseRef: task.case?.ownRef ?? null });

@Injectable()
export class StandupService {
  constructor(private prisma: PrismaService) {}

  async statesFor(firmId: string, userIds: string[], day: string): Promise<Map<string, StandupState>> {
    if (!userIds.length) return new Map();
    const date = new Date(`${day}T00:00:00Z`);
    const [members, leaves, holiday, entries] = await Promise.all([
      this.prisma.firmMember.findMany({ where: { firmId, userId: { in: userIds } }, select: { userId: true, role: true } }),
      this.prisma.leaveRequest.findMany({ where: { firmId, userId: { in: userIds }, status: 'APPROVED', startDate: { lte: date }, endDate: { gte: date } }, select: { userId: true } }),
      this.prisma.publicHoliday.findUnique({ where: { date } }),
      this.prisma.dailyStandup.findMany({ where: { firmId, userId: { in: userIds }, day: date } }),
    ]);
    const byUser = new Map(entries.map((e) => [e.userId, e]));
    const onLeave = new Set(leaves.map((l) => l.userId));
    const roles = new Map(members.map((m) => [m.userId, m.role]));
    return new Map(userIds.map((id) => {
      const firmRole = roles.get(id) ?? '';
      let state: StandupState = 'not_required';
      if (standupRequired({ firmRole, day, onLeave: false, isHoliday: !!holiday })) {
        const entry = byUser.get(id);
        state = onLeave.has(id) ? 'on_leave' : !entry ? 'not_yet' : entry.status === 'SKIPPED' ? 'skipped' : entry.blocker?.trim() ? 'blocked' : 'checked_in';
      }
      return [id, state];
    }));
  }

  async today(user: AuthUser): Promise<StandupToday> {
    const day = bangkokDayKey(new Date());
    const [states, row, suggestions] = await Promise.all([
      this.statesFor(user.firmId, [user.id], day),
      this.prisma.dailyStandup.findUnique({ where: { firmId_userId_day: { firmId: user.firmId, userId: user.id, day: new Date(`${day}T00:00:00Z`) } } }),
      this.suggestions(user, day),
    ]);
    const state = states.get(user.id) ?? 'not_required';
    return { day, state, required: state !== 'not_required' && state !== 'on_leave', entry: row ? (await this.views(user.firmId, [row]))[0] : null, suggestions };
  }

  async upsert(user: AuthUser, dto: StandupDto): Promise<StandupEntry> {
    const ids = [...new Set([...dto.yesterdayTaskIds, ...dto.todayTaskIds])];
    await assertFirmRefs(this.prisma, user.firmId, { taskIds: ids });
    if (ids.length && await this.prisma.task.count({ where: { AND: [firmTaskScope(user.firmId), { id: { in: ids }, assigneeId: user.id }] } }) !== ids.length) {
      throw new BadRequestException('เลือกได้เฉพาะงานที่มอบหมายให้คุณในสำนักงานนี้');
    }
    return this.write(user, { ...dto, status: 'CHECKED_IN', yesterdayNote: dto.yesterdayNote?.trim() || null, todayNote: dto.todayNote?.trim() || null, blocker: dto.blocker?.trim() || null });
  }

  async skip(user: AuthUser): Promise<StandupEntry> {
    return this.write(user, { status: 'SKIPPED', yesterdayTaskIds: [], todayTaskIds: [], yesterdayNote: null, todayNote: null, blocker: null });
  }

  private async write(user: AuthUser, data: Pick<DailyStandup, 'status' | 'yesterdayTaskIds' | 'todayTaskIds' | 'yesterdayNote' | 'todayNote' | 'blocker'>) {
    const key = { firmId: user.firmId, userId: user.id, day: new Date(`${bangkokDayKey(new Date())}T00:00:00Z`) };
    const row = await this.prisma.dailyStandup.upsert({ where: { firmId_userId_day: key }, create: { ...key, ...data }, update: data });
    return (await this.views(user.firmId, [row]))[0];
  }

  async history(user: AuthUser, userId: string, days: number): Promise<StandupEntry[]> {
    const member = await this.prisma.firmMember.findUnique({ where: { firmId_userId: { firmId: user.firmId, userId } } });
    if (!member) throw new NotFoundException('ไม่พบสมาชิกในสำนักงาน');
    const end = new Date(`${bangkokDayKey(new Date())}T00:00:00Z`);
    const rows = await this.prisma.dailyStandup.findMany({ where: { firmId: user.firmId, userId, day: { gte: new Date(end.getTime() - (days - 1) * DAY_MS), lte: end } }, orderBy: { day: 'desc' } });
    return this.views(user.firmId, rows);
  }

  private async views(firmId: string, rows: DailyStandup[]): Promise<StandupEntry[]> {
    const ids = [...new Set(rows.flatMap((r) => [...r.yesterdayTaskIds, ...r.todayTaskIds]))];
    const tasks = ids.length ? await this.prisma.task.findMany({ where: { AND: [firmTaskScope(firmId), { id: { in: ids } }] }, select: taskSelect }) : [];
    const refs = new Map(tasks.map((t) => [t.id, taskRef(t)]));
    const pick = (ids: string[]) => ids.flatMap((id) => refs.has(id) ? [refs.get(id)!] : []);
    return rows.map((r) => ({ day: r.day.toISOString().slice(0, 10), status: r.status, yesterday: pick(r.yesterdayTaskIds), yesterdayNote: r.yesterdayNote, today: pick(r.todayTaskIds), todayNote: r.todayNote, blocker: r.blocker, updatedAt: r.updatedAt.toISOString() }));
  }

  async suggestions(user: AuthUser, day: string): Promise<StandupToday['suggestions']> {
    const holidays = await this.prisma.publicHoliday.findMany({ where: { date: { lt: new Date(`${day}T00:00:00Z`) } }, select: { date: true } });
    const holidayDays = new Set(holidays.map((h) => h.date.toISOString().slice(0, 10)));
    let previous = new Date(`${day}T00:00:00Z`);
    do { previous = new Date(previous.getTime() - DAY_MS); }
    while ([0, 6].includes(previous.getUTCDay()) || holidayDays.has(previous.toISOString().slice(0, 10)));
    const start = new Date(`${previous.toISOString().slice(0, 10)}T00:00:00+07:00`);
    const end = new Date(start.getTime() + DAY_MS);
    const todayStart = new Date(`${day}T00:00:00+07:00`);
    const [yesterday, today] = await Promise.all([
      this.prisma.task.findMany({ where: { AND: [firmTaskScope(user.firmId), { assigneeId: user.id, OR: [
        { comments: { some: { authorId: user.id, kind: 'DAILY_UPDATE', createdAt: { gte: start, lt: end } } } },
        { status: 'DONE', completedAt: { gte: start, lt: end } },
      ] }] }, select: taskSelect, orderBy: [{ queuePosition: 'asc' }, { id: 'asc' }], take: 20 }),
      this.prisma.task.findMany({ where: { AND: [firmTaskScope(user.firmId), { assigneeId: user.id, status: { notIn: ['DONE', 'PENDING_REVIEW'] }, OR: [
        { scheduledFor: new Date(`${day}T00:00:00Z`) },
        { scheduledFor: null, dueDate: { gte: todayStart, lt: new Date(todayStart.getTime() + DAY_MS) } },
      ] }] }, select: taskSelect, orderBy: [{ queuePosition: 'asc' }, { id: 'asc' }], take: 20 }),
    ]);
    return { yesterday: yesterday.map(taskRef), today: today.map(taskRef) };
  }
}
