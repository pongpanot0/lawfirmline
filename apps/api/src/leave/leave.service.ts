import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AuthUser, FirmRole, hasFirmCapability, rolesWithCapability } from '@lawfirm/shared';
import { EventType, LeaveStatus, LeaveType, NotificationCategory, Prisma } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.module';
import { buildActionCard, LineMessagingService } from '../notifications/line-messaging.service';
import { AssignmentNotifierService } from '../notifications/assignment-notifier.service';
import { NotificationCenterService } from '../notifications/notification-center.service';
import { addBangkokDays, bangkokDayKey, bangkokDayStart, bangkokDayEnd, formatBangkokDateThai, formatBangkokDateTime, isBangkokWeekend } from '../common/utils/bangkok-time';
import { eventForUserWhere } from '../calendar/event-people';
import { canSeeLeaveDetail, leaveVisibleWhere } from './leave-visibility';

const LABEL: Record<LeaveType, string> = {
  SICK: 'ลาป่วย',
  PERSONAL: 'ลากิจ',
  VACATION: 'พักร้อน',
};
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
const key = (value: Date) => value.toISOString().slice(0, 10);
const bangkokHour = (now: Date) => (now.getUTCHours() + 7) % 24;
/** The "who's out today" round goes at 08:00; anything approved for today after that goes out as an add-on. */
const MORNING_HOUR = 8;

type Leave = {
  id: string;
  firmId: string;
  userId: string;
  type: LeaveType;
  status: LeaveStatus;
  startDate: Date;
  endDate: Date;
  user: { firstName: string; lastName: string; lineUserId?: string | null };
};

@Injectable()
export class LeaveService {
  private readonly logger = new Logger(LeaveService.name);
  constructor(
    private prisma: PrismaService,
    private line: LineMessagingService,
    private notifier: AssignmentNotifierService,
    private center: NotificationCenterService,
  ) {}

  async pending(user: AuthUser) {
    if (!hasFirmCapability(user.firmRole, 'approveLeave')) throw new ForbiddenException('Insufficient permissions');
    const leaves = await this.prisma.leaveRequest.findMany({
      // Only an owner may decide their own leave (and theirs auto-approve anyway).
      where: { firmId: user.firmId, status: LeaveStatus.PENDING, ...(user.firmRole !== FirmRole.OWNER && { userId: { not: user.id } }) },
      include: { user: { select: { firstName: true, lastName: true } } },
      orderBy: [{ startDate: 'asc' }, { id: 'asc' }],
    });
    return Promise.all(leaves.map(async leave => ({ ...leave,
      courtConflicts: await this.findCourtConflicts(leave.firmId, leave.userId, leave.startDate, leave.endDate),
    })));
  }

  async list(user: AuthUser, from: string, to: string) {
    const start = this.parseDate(from);
    const end = this.parseDate(to);
    if (end < start || end.getTime() - start.getTime() > 366 * 86400000) throw new BadRequestException('ช่วงวันที่ไม่ถูกต้อง');
    const leaves = await this.prisma.leaveRequest.findMany({
      where: { AND: [leaveVisibleWhere(user), { startDate: { lte: end }, endDate: { gte: start } }] },
      include: { user: { select: { firstName: true, lastName: true } }, decidedBy: { select: { firstName: true, lastName: true } } },
      orderBy: { startDate: 'asc' },
    });
    return Promise.all(leaves.map(async (leave) => {
      if (!canSeeLeaveDetail(user, leave.userId)) {
        // Someone else's approved leave: who is out and when, nothing more.
        const { id, userId, status, startDate, endDate, user: person } = leave;
        return { id, userId, status, startDate, endDate, user: person, type: null, decidedAt: null, decidedBy: null };
      }
      return {
        ...leave,
        courtConflicts: leave.status === LeaveStatus.PENDING
          ? await this.findCourtConflicts(leave.firmId, leave.userId, leave.startDate, leave.endDate)
          : undefined,
      };
    }));
  }

  /** Court dates on this person's calendar during the leave — one of the event's assignees, or the case's lead lawyer when none is set. */
  async findCourtConflicts(firmId: string, userId: string, start: Date, end: Date) {
    const events = await this.prisma.calendarEvent.findMany({
      where: {
        type: EventType.COURT_DATE,
        startAt: { gte: bangkokDayStart(start), lt: bangkokDayEnd(end) },
        case: { firmId },
        ...eventForUserWhere(userId),
      },
      include: { case: { select: { ownRef: true } } },
      orderBy: { startAt: 'asc' },
    });
    return events.map((event) => ({
      eventId: event.id,
      caseId: event.caseId,
      caseRef: event.case.ownRef,
      title: event.title,
      courtName: event.courtName,
      startAt: event.startAt,
    }));
  }

  async myLeaves(user: Pick<AuthUser, 'id' | 'firmId'>) {
    return this.prisma.leaveRequest.findMany({
      where: { firmId: user.firmId, userId: user.id, endDate: { gte: day(bangkokDayKey(new Date())) } },
      orderBy: { startDate: 'asc' },
      take: 10,
    });
  }

  /** `audit` (MCP) is written in the same transaction as the leave row. */
  async create(user: AuthUser, input: { type: LeaveType; startDate: string; endDate: string }, audit?: (entityId: string) => Prisma.AuditLogUncheckedCreateInput) {
    if (!Object.values(LeaveType).includes(input.type)) throw new BadRequestException('ประเภทการลาไม่ถูกต้อง');
    const startDate = this.parseDate(input.startDate);
    const endDate = this.parseDate(input.endDate);
    const today = day(bangkokDayKey(new Date()));
    if (startDate < today || endDate < startDate || endDate.getTime() - startDate.getTime() > 89 * 86400000 || startDate.getTime() - today.getTime() > 365 * 86400000) {
      throw new BadRequestException('กรุณาเลือกวันเริ่มตั้งแต่วันนี้ ช่วงลาไม่เกิน 90 วัน และล่วงหน้าไม่เกิน 1 ปี');
    }
    const member = await this.prisma.firmMember.findUnique({ where: { firmId_userId: { firmId: user.firmId, userId: user.id } } });
    if (!member) throw new ForbiddenException('ไม่ใช่สมาชิกสำนักงานนี้');
    const overlap = await this.prisma.leaveRequest.findFirst({
      where: { firmId: user.firmId, userId: user.id, startDate: { lte: endDate }, endDate: { gte: startDate }, status: { not: LeaveStatus.REJECTED } },
    });
    if (overlap) throw new BadRequestException('มีรายการลาทับช่วงนี้แล้ว');
    // Every type waits for an approver; only an owner (who has no one above them) self-approves.
    const status = user.firmRole === FirmRole.OWNER ? LeaveStatus.APPROVED : LeaveStatus.PENDING;
    let leave: Leave;
    try {
      const insert = (db: Prisma.TransactionClient) => db.leaveRequest.create({
        data: { firmId: user.firmId, userId: user.id, type: input.type, startDate, endDate, status },
        include: { user: { select: { firstName: true, lastName: true } } },
      });
      leave = audit
        ? await this.prisma.$transaction(async (tx) => {
          const created = await insert(tx);
          await tx.auditLog.create({ data: audit(created.id) });
          return created;
        })
        : await insert(this.prisma);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new BadRequestException('มีรายการลาช่วงนี้แล้ว');
      throw error;
    }
    if (leave.status === LeaveStatus.PENDING) {
      try { await this.sendApprovalRequest(leave); }
      catch (error) { this.logger.error(`Leave approval request ${leave.id} failed: ${(error as Error).message}`); }
      await this.notifier.notifyFirmOwners({
        firmId: leave.firmId, actorUserId: user.id, category: NotificationCategory.LEAVE, line: false,
        roles: rolesWithCapability('approveLeave'),
        summaryText: `🗓 คำขอลา · รออนุมัติ\n${this.detail(leave)}`, entityPath: '/leaves',
      });
    } else {
      await this.announceIfToday(leave);
    }
    return leave;
  }

  async decide(user: AuthUser, leaveId: string, decision: 'APPROVED' | 'REJECTED') {
    if (decision !== LeaveStatus.APPROVED && decision !== LeaveStatus.REJECTED) throw new BadRequestException('ผลการพิจารณาต้องเป็นอนุมัติหรือไม่อนุมัติ');
    const leave = await this.prisma.leaveRequest.findFirst({
      where: { id: leaveId, firmId: user.firmId },
      include: { user: { select: { firstName: true, lastName: true, lineUserId: true } } },
    });
    if (!leave) throw new NotFoundException('ไม่พบรายการลา');
    if (leave.status !== LeaveStatus.PENDING) throw new BadRequestException('คำขอลานี้พิจารณาไปแล้ว');
    if (!hasFirmCapability(user.firmRole, 'approveLeave')) throw new ForbiddenException('ไม่มีสิทธิ์อนุมัติการลา');
    if (leave.userId === user.id && user.firmRole !== FirmRole.OWNER) throw new ForbiddenException('อนุมัติการลาของตนเองไม่ได้');
    // Claim only while still PENDING so two owners deciding at once can't both win.
    const data = { status: decision, decidedById: user.id, decidedAt: new Date() };
    const claimed = await this.prisma.leaveRequest.updateMany({ where: { id: leaveId, firmId: user.firmId, status: LeaveStatus.PENDING }, data });
    if (!claimed.count) throw new BadRequestException('คำขอลานี้พิจารณาไปแล้ว');
    const decided = { ...leave, ...data };
    const verdict = decision === LeaveStatus.APPROVED ? 'อนุมัติ' : 'ปฏิเสธ';
    await this.notifier.notifyAssigned({
      firmId: leave.firmId, userIds: [leave.userId], actorUserId: user.id, category: NotificationCategory.LEAVE, line: false,
      summaryText: `${decision === LeaveStatus.APPROVED ? '✅' : '❌'} คำขอลาได้รับการ${verdict}\n${LABEL[leave.type]} · ${this.rangeText(decided)}`,
      entityPath: '/leaves',
    });
    if (decided.user.lineUserId) {
      try {
        if ((await this.lineAllowed([leave.userId])).has(leave.userId)) await this.sendOnce(`decision:${leaveId}`, decided.user.lineUserId,
          `คำขอลา ${this.rangeText(decided)} ได้รับการ${decision === LeaveStatus.APPROVED ? 'อนุมัติ' : 'ปฏิเสธ'}แล้ว`);
      } catch (error) { this.logger.error(`Leave decision notice ${leaveId} failed: ${(error as Error).message}`); }
    }
    if (decision === LeaveStatus.APPROVED) await this.announceIfToday(decided);
    return decided;
  }

  async cancel(user: AuthUser, id: string) {
    const leave = await this.prisma.leaveRequest.findFirst({
      where: { id, firmId: user.firmId },
      include: { user: { select: { firstName: true, lastName: true } } },
    });
    if (!leave) throw new NotFoundException('ไม่พบรายการลา');
    if (leave.userId !== user.id && !hasFirmCapability(user.firmRole, 'approveLeave')) throw new ForbiddenException('ยกเลิกได้เฉพาะรายการลาของตนเอง');
    await this.prisma.leaveRequest.delete({ where: { id } });
    // Members were only ever told about approved leave — nothing to retract otherwise.
    if (leave.status !== LeaveStatus.APPROVED) return { deleted: true };
    try { await this.broadcast(leave.firmId, [leave], '❌ ยกเลิกการลา', true, `cancel:${leave.id}`); }
    catch (error) { this.logger.error(`Leave ${leave.id} cancellation notice failed: ${(error as Error).message}`); }
    return { deleted: true };
  }

  /** "ชื่อ · ช่วงวัน" — what anyone but the approvers is told about someone's leave. */
  who(leave: Pick<Leave, 'user' | 'startDate' | 'endDate'>, showRange = true) {
    const name = `${leave.user.firstName} ${leave.user.lastName}`.trim();
    return showRange ? `${name} · ${this.rangeText(leave)}` : name;
  }

  private parseDate(value: string): Date {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) throw new BadRequestException('วันที่ต้องเป็น YYYY-MM-DD');
    const parsed = day(value);
    if (Number.isNaN(parsed.getTime()) || key(parsed) !== value) throw new BadRequestException('วันที่ไม่ถูกต้อง');
    return parsed;
  }

  private async lineAllowed(userIds: string[]): Promise<Set<string>> {
    if (!userIds.length) return new Set();
    const channels = await this.center.channelsFor(userIds, NotificationCategory.LEAVE);
    return new Set(userIds.filter((id) => channels.get(id)?.line));
  }

  private rangeText(leave: Pick<Leave, 'startDate' | 'endDate'>) {
    return leave.startDate.getTime() === leave.endDate.getTime()
      ? formatBangkokDateThai(leave.startDate)
      : `${formatBangkokDateThai(leave.startDate)}–${formatBangkokDateThai(leave.endDate)}`;
  }

  /** Name, type and dates — approvers only. */
  private detail(leave: Leave) {
    return `${this.who(leave, false)} · ${LABEL[leave.type]} · ${this.rangeText(leave)}`;
  }

  /** Marks `id` done; false when it already was. */
  private async claim(id: string): Promise<boolean> {
    try {
      await this.prisma.leaveNoticeLog.create({ data: { key: id, sentAt: new Date() } });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return false;
      throw error;
    }
  }

  private async sendOnce(id: string, lineUserId: string, message: string | object) {
    const claimedAt = new Date();
    try {
      await this.prisma.leaveNoticeLog.create({ data: { key: id, claimedAt } });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
      const reclaimed = await this.prisma.leaveNoticeLog.updateMany({
        where: { key: id, sentAt: null, claimedAt: { lt: new Date(claimedAt.getTime() - 5 * 60000) } },
        data: { claimedAt },
      });
      if (!reclaimed.count) return;
    }
    try {
      const sent = typeof message === 'string'
        ? await this.line.sendText(message.slice(0, 4900), [lineUserId])
        : await this.line.push(lineUserId, [message]);
      if (sent) await this.prisma.leaveNoticeLog.update({ where: { key: id }, data: { sentAt: new Date() } });
      else await this.prisma.leaveNoticeLog.deleteMany({ where: { key: id, claimedAt, sentAt: null } });
    } catch (error) {
      await this.prisma.leaveNoticeLog.deleteMany({ where: { key: id, claimedAt, sentAt: null } });
      throw error;
    }
  }

  /**
   * Tell every member (EXTERNAL excluded) who is out — names and dates, never the type,
   * and never their own leave — on LINE (once per member per `stamp`) and in the app (once per `stamp`).
   */
  private async broadcast(firmId: string, leaves: Leave[], title: string, showRange: boolean, stamp: string) {
    const members = await this.prisma.firmMember.findMany({
      where: { firmId, role: { not: FirmRole.EXTERNAL } },
      select: { userId: true, user: { select: { lineUserId: true } } },
    });
    const lineOk = await this.lineAllowed(members.filter((member) => member.user.lineUserId).map((member) => member.userId));
    const app = await this.claim(`app:${stamp}`);
    const byText = new Map<string, string[]>();
    for (const member of members) {
      const others = leaves.filter((leave) => leave.userId !== member.userId);
      if (!others.length) continue;
      const text = `${title}\n${others.map((leave) => `• ${this.who(leave, showRange)}`).join('\n')}`;
      byText.set(text, [...(byText.get(text) ?? []), member.userId]);
      if (!member.user.lineUserId || !lineOk.has(member.userId)) continue;
      try { await this.sendOnce(`${stamp}:${member.userId}`, member.user.lineUserId, text); }
      catch (error) { this.logger.error(`Leave notice ${stamp} failed for ${member.userId}: ${(error as Error).message}`); }
    }
    if (!app) return;
    for (const [summaryText, userIds] of byText) {
      await this.notifier.notifyAssigned({ firmId, userIds, actorUserId: '', category: NotificationCategory.LEAVE, line: false, summaryText, entityPath: '/leaves' });
    }
  }

  private async isWorkingDay(today: Date) {
    if (isBangkokWeekend(today)) return false;
    return !(await this.prisma.publicHoliday.findUnique({ where: { date: today }, select: { id: true } }));
  }

  /**
   * "Who's out today" for one firm: every approved leave covering today not yet announced today.
   * Each leave is claimed once a day, so the 08:00 round and an approval racing it never announce
   * it twice; the first batch is the morning notice and anything after is an add-on.
   * ponytail: a crash between claim and send drops that batch; add a sentAt reclaim if it ever bites.
   */
  private async announceToday(firmId: string, now: Date) {
    const todayKey = bangkokDayKey(now);
    const today = day(todayKey);
    if (!(await this.isWorkingDay(today))) return;
    const leaves = await this.prisma.leaveRequest.findMany({
      where: { firmId, status: LeaveStatus.APPROVED, startDate: { lte: today }, endDate: { gte: today } },
      include: { user: { select: { firstName: true, lastName: true } } },
      orderBy: [{ startDate: 'asc' }, { id: 'asc' }],
    });
    const fresh: Leave[] = [];
    for (const leave of leaves) if (await this.claim(`out:${todayKey}:${leave.id}`)) fresh.push(leave);
    if (!fresh.length) return;
    const first = await this.claim(`out:${todayKey}:${firmId}`);
    const title = first ? `📅 วันนี้ไม่อยู่ (${formatBangkokDateThai(today)})` : '📅 วันนี้ไม่อยู่เพิ่ม';
    await this.broadcast(firmId, fresh, title, false, `out:${todayKey}:${fresh[0].id}`);
  }

  /** Approved leave that covers today, after the 08:00 round, goes out now instead of waiting for tomorrow. */
  private async announceIfToday(leave: Pick<Leave, 'firmId' | 'startDate' | 'endDate'>, now = new Date()) {
    const today = day(bangkokDayKey(now));
    if (leave.startDate > today || leave.endDate < today || bangkokHour(now) < MORNING_HOUR) return;
    try { await this.announceToday(leave.firmId, now); }
    catch (error) { this.logger.error(`Leave add-on notice for ${leave.firmId} failed: ${(error as Error).message}`); }
  }

  private async sendApprovalRequest(leave: Leave) {
    const conflicts = await this.findCourtConflicts(leave.firmId, leave.userId, leave.startDate, leave.endDate);
    const name = this.who(leave, false);
    const range = this.rangeText(leave);
    const lines = [
      'คำขอลา · รออนุมัติ',
      `${name} · ${LABEL[leave.type]}`,
      range,
      ...conflicts.map((c) => `⚠ ชนนัดศาล: ${c.caseRef ?? ''} ${formatBangkokDateTime(c.startAt)} ${c.courtName ?? ''}`.replace(/\s+/g, ' ').trim()),
    ];
    const card = buildActionCard(`คำขอลา · ${name} · ${range}`, lines, [
      { label: 'อนุมัติ', text: `อนุมัติลา ${name} ${range}`, data: `leave:approve:${leave.id}` },
      { label: 'ไม่อนุมัติ', text: `ไม่อนุมัติลา ${name} ${range}`, data: `leave:reject:${leave.id}` },
    ]);
    const owners = await this.prisma.firmMember.findMany({
      where: { firmId: leave.firmId, role: { in: rolesWithCapability('approveLeave') }, user: { lineUserId: { not: null } } },
      select: { userId: true, user: { select: { lineUserId: true } } },
    });
    const allowed = await this.lineAllowed(owners.map((owner) => owner.userId));
    for (const owner of owners) {
      if (owner.userId === leave.userId || !owner.user.lineUserId || !allowed.has(owner.userId)) continue;
      try {
        await this.sendOnce(`approve-req:${leave.id}:${owner.userId}`, owner.user.lineUserId, card);
      } catch (error) { this.logger.error(`Leave approval request failed for ${owner.userId}: ${(error as Error).message}`); }
    }
  }

  @Cron('*/10 * * * *', { timeZone: 'Asia/Bangkok' })
  async sendNotices(now = new Date()) {
    if (bangkokHour(now) < MORNING_HOUR) return;
    const todayKey = bangkokDayKey(now);
    const today = day(todayKey);
    const threeDays = day(bangkokDayKey(addBangkokDays(now, 3)));
    const weekEnd = day(bangkokDayKey(addBangkokDays(now, 6)));
    const monday = today.getUTCDay() === 1;
    const leaves = await this.prisma.leaveRequest.findMany({
      where: { status: LeaveStatus.APPROVED, startDate: { lte: monday ? weekEnd : threeDays }, endDate: { gte: today } },
      include: { user: { select: { firstName: true, lastName: true } } },
      orderBy: [{ startDate: 'asc' }, { id: 'asc' }],
    });
    const byFirm = new Map<string, typeof leaves>();
    for (const leave of leaves) byFirm.set(leave.firmId, [...(byFirm.get(leave.firmId) ?? []), leave]);
    // A Monday holiday skips the week round too; the three-day and day-of notices still cover it.
    const weekly = monday && (await this.isWorkingDay(today));
    for (const [firmId, firmLeaves] of byFirm) {
      try {
        if (firmLeaves.some((l) => l.startDate <= today)) await this.announceToday(firmId, now);
        if (weekly) await this.broadcast(firmId, firmLeaves, `📅 คนลาสัปดาห์นี้ (${formatBangkokDateThai(today)})`, true, `week:${todayKey}:${firmId}`);
        const soon = firmLeaves.filter((l) => key(l.startDate) === key(threeDays));
        if (soon.length) await this.broadcast(firmId, soon, '📅 แจ้งลาล่วงหน้า 3 วัน', true, `three:${todayKey}:${firmId}`);
      } catch (error) { this.logger.error(`Leave notices for ${firmId} failed: ${(error as Error).message}`); }
    }
  }
}
