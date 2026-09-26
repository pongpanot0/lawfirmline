import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AuthUser, FirmRole } from '@lawfirm/shared';
import { EventType, LeaveStatus, LeaveType, Prisma } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.module';
import { LineMessagingService, QuickReplyItem } from '../notifications/line-messaging.service';
import { addBangkokDays, bangkokDayKey, formatBangkokDateThai, formatBangkokDateTime } from '../common/utils/bangkok-time';
import { eventForUserWhere } from '../calendar/event-people';

const LABEL: Record<LeaveType, string> = {
  SICK: 'ลาป่วย',
  PERSONAL: 'ลากิจ',
  VACATION: 'พักร้อน',
};
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
const key = (value: Date) => value.toISOString().slice(0, 10);

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
  constructor(private prisma: PrismaService, private line: LineMessagingService) {}

  async list(user: AuthUser, from: string, to: string) {
    const start = this.parseDate(from);
    const end = this.parseDate(to);
    if (end < start || end.getTime() - start.getTime() > 366 * 86400000) throw new BadRequestException('ช่วงวันที่ไม่ถูกต้อง');
    const leaves = await this.prisma.leaveRequest.findMany({
      where: { firmId: user.firmId, startDate: { lte: end }, endDate: { gte: start } },
      include: { user: { select: { firstName: true, lastName: true } } },
      orderBy: { startDate: 'asc' },
    });
    return Promise.all(leaves.map(async (leave) => ({
      ...leave,
      courtConflicts: leave.status === LeaveStatus.PENDING
        ? await this.findCourtConflicts(leave.firmId, leave.userId, leave.startDate, leave.endDate)
        : undefined,
    })));
  }

  /** Court dates on this person's calendar during the leave — assignee, or the case's lead lawyer when unassigned. */
  async findCourtConflicts(firmId: string, userId: string, start: Date, end: Date) {
    const events = await this.prisma.calendarEvent.findMany({
      where: {
        type: EventType.COURT_DATE,
        startAt: { gte: start, lt: new Date(end.getTime() + 86400000) },
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

  async create(user: AuthUser, input: { type: LeaveType; startDate: string; endDate: string }) {
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
    const status = input.type === LeaveType.SICK || user.firmRole === FirmRole.OWNER ? LeaveStatus.APPROVED : LeaveStatus.PENDING;
    let leave: Leave;
    try {
      leave = await this.prisma.leaveRequest.create({
        data: { firmId: user.firmId, userId: user.id, type: input.type, startDate, endDate, status },
        include: { user: { select: { firstName: true, lastName: true } } },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new BadRequestException('มีรายการลาช่วงนี้แล้ว');
      throw error;
    }
    if (leave.status === LeaveStatus.PENDING) {
      try { await this.sendApprovalRequest(leave); }
      catch (error) { this.logger.error(`Leave approval request ${leave.id} failed: ${(error as Error).message}`); }
    } else if (leave.type === LeaveType.SICK) {
      try { await this.sendSick(leave); }
      catch (error) { this.logger.error(`Sick leave ${leave.id} notice failed: ${(error as Error).message}`); }
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
    if (leave.status !== LeaveStatus.PENDING) throw new BadRequestException('คำขอนี้ตัดสินไปแล้ว');
    if (user.firmRole !== FirmRole.OWNER) throw new ForbiddenException('อนุมัติได้เฉพาะเจ้าของสำนักงาน');
    // Claim only while still PENDING so two owners deciding at once can't both win.
    const data = { status: decision, decidedById: user.id, decidedAt: new Date() };
    const claimed = await this.prisma.leaveRequest.updateMany({ where: { id: leaveId, firmId: user.firmId, status: LeaveStatus.PENDING }, data });
    if (!claimed.count) throw new BadRequestException('คำขอนี้ตัดสินไปแล้ว');
    const decided = { ...leave, ...data };
    if (decided.user.lineUserId) {
      try {
        await this.sendOnce(`decision:${leaveId}`, decided.user.lineUserId,
          `คำขอลา ${this.rangeText(decided)} ได้รับการ${decision === LeaveStatus.APPROVED ? 'อนุมัติ' : 'ปฏิเสธ'}แล้ว`);
      } catch (error) { this.logger.error(`Leave decision notice ${leaveId} failed: ${(error as Error).message}`); }
    }
    return decided;
  }

  async cancel(user: AuthUser, id: string) {
    const leave = await this.prisma.leaveRequest.findFirst({
      where: { id, firmId: user.firmId },
      include: { user: { select: { firstName: true, lastName: true } } },
    });
    if (!leave) throw new NotFoundException('ไม่พบรายการลา');
    if (leave.userId !== user.id && user.firmRole !== FirmRole.OWNER) throw new ForbiddenException('ยกเลิกได้เฉพาะรายการลาของตนเอง');
    await this.prisma.leaveRequest.delete({ where: { id } });
    // Members were only ever told about approved leave — nothing to retract otherwise.
    if (leave.status !== LeaveStatus.APPROVED) return { deleted: true };
    try {
      for (const member of await this.members(leave.firmId)) {
        if (member.userId === leave.userId || !member.user.lineUserId) continue;
        try {
          await this.sendOnce(`cancel:${leave.id}:${member.userId}`, member.user.lineUserId,
            `❌ ยกเลิกการลา\n${this.label(leave)}`);
        } catch (error) { this.logger.error(`Leave cancellation notice failed for ${member.userId}: ${(error as Error).message}`); }
      }
    } catch (error) { this.logger.error(`Leave ${leave.id} cancellation notice failed: ${(error as Error).message}`); }
    return { deleted: true };
  }

  private parseDate(value: string): Date {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) throw new BadRequestException('วันที่ต้องเป็น YYYY-MM-DD');
    const parsed = day(value);
    if (Number.isNaN(parsed.getTime()) || key(parsed) !== value) throw new BadRequestException('วันที่ไม่ถูกต้อง');
    return parsed;
  }

  private async members(firmId: string) {
    return this.prisma.firmMember.findMany({
      where: { firmId, user: { lineUserId: { not: null } } },
      select: { userId: true, user: { select: { lineUserId: true } } },
    });
  }

  private rangeText(leave: Pick<Leave, 'startDate' | 'endDate'>) {
    return leave.startDate.getTime() === leave.endDate.getTime()
      ? formatBangkokDateThai(leave.startDate)
      : `${formatBangkokDateThai(leave.startDate)}–${formatBangkokDateThai(leave.endDate)}`;
  }

  private label(leave: Leave, showRange = true) {
    const name = `${leave.user.firstName} ${leave.user.lastName}`.trim();
    return `${name} · ${LABEL[leave.type]}${showRange ? ` · ${this.rangeText(leave)}` : ''}`;
  }

  private async sendOnce(id: string, lineUserId: string, message: string, quickReply?: QuickReplyItem[]) {
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
      const text = message.slice(0, 4900);
      const sent = quickReply?.length
        ? await this.line.pushTo(lineUserId, text, quickReply)
        : await this.line.sendText(text, [lineUserId]);
      if (sent) await this.prisma.leaveNoticeLog.update({ where: { key: id }, data: { sentAt: new Date() } });
      else await this.prisma.leaveNoticeLog.deleteMany({ where: { key: id, claimedAt, sentAt: null } });
    } catch (error) {
      await this.prisma.leaveNoticeLog.deleteMany({ where: { key: id, claimedAt, sentAt: null } });
      throw error;
    }
  }

  private async sendSick(leave: Leave) {
    for (const member of await this.members(leave.firmId)) {
      if (member.userId === leave.userId || !member.user.lineUserId) continue;
      try {
        await this.sendOnce(`sick:${leave.id}:${member.userId}`, member.user.lineUserId,
          `🤒 แจ้งลาป่วย\n${this.label(leave)}`);
      } catch (error) { this.logger.error(`Sick leave notice failed for ${member.userId}: ${(error as Error).message}`); }
    }
  }

  private async sendApprovalRequest(leave: Leave) {
    const conflicts = await this.findCourtConflicts(leave.firmId, leave.userId, leave.startDate, leave.endDate);
    const name = `${leave.user.firstName} ${leave.user.lastName}`.trim();
    const lines = [
      'คำขอลา · รออนุมัติ',
      `${name} · ${LABEL[leave.type]}`,
      this.rangeText(leave),
      ...conflicts.map((c) => `⚠ ชนนัดศาล: ${c.caseRef ?? ''} ${formatBangkokDateTime(c.startAt)} ${c.courtName ?? ''}`.replace(/\s+/g, ' ').trim()),
    ];
    const text = lines.join('\n');
    const quickReply: QuickReplyItem[] = [
      { label: 'อนุมัติ', text: 'อนุมัติลา', data: `leave:approve:${leave.id}` },
      { label: 'ไม่อนุมัติ', text: 'ไม่อนุมัติลา', data: `leave:reject:${leave.id}` },
    ];
    const owners = await this.prisma.firmMember.findMany({
      where: { firmId: leave.firmId, role: FirmRole.OWNER, user: { lineUserId: { not: null } } },
      select: { userId: true, user: { select: { lineUserId: true } } },
    });
    for (const owner of owners) {
      if (!owner.user.lineUserId) continue;
      try {
        await this.sendOnce(`approve-req:${leave.id}:${owner.userId}`, owner.user.lineUserId, text, quickReply);
      } catch (error) { this.logger.error(`Leave approval request failed for ${owner.userId}: ${(error as Error).message}`); }
    }
  }

  private async sendDigest(firmId: string, leaves: Leave[], stamp: string, title: string) {
    for (const member of await this.members(firmId)) {
      if (!member.user.lineUserId) continue;
      const others = leaves.filter((leave) => leave.userId !== member.userId);
      if (!others.length) continue;
      try {
        await this.sendOnce(`${stamp}:${firmId}:${member.userId}`, member.user.lineUserId,
          `${title}\n${others.map((leave) => `• ${this.label(leave)}`).join('\n')}`);
      } catch (error) { this.logger.error(`Leave digest failed for ${member.userId}: ${(error as Error).message}`); }
    }
  }

  @Cron('*/10 * * * *', { timeZone: 'Asia/Bangkok' })
  async sendNotices(now = new Date()) {
    const todayKey = bangkokDayKey(now);
    const today = day(todayKey);
    const sick = await this.prisma.leaveRequest.findMany({
      where: { type: LeaveType.SICK, status: LeaveStatus.APPROVED, endDate: { gte: today }, createdAt: { gte: addBangkokDays(now, -400) } },
      include: { user: { select: { firstName: true, lastName: true } } },
    });
    for (const leave of sick) await this.sendSick(leave);

    const bangkokHour = (now.getUTCHours() + 7) % 24;
    if (bangkokHour < 8) return;
    const threeDays = day(bangkokDayKey(addBangkokDays(now, 3)));
    const weekEnd = day(bangkokDayKey(addBangkokDays(now, 6)));
    const monday = today.getUTCDay() === 1;
    const planned = await this.prisma.leaveRequest.findMany({
      where: { type: { in: [LeaveType.PERSONAL, LeaveType.VACATION] }, status: LeaveStatus.APPROVED, startDate: { lte: monday ? weekEnd : threeDays }, endDate: { gte: today } },
      include: { user: { select: { firstName: true, lastName: true } } },
    });
    const byFirm = new Map<string, typeof planned>();
    for (const leave of planned) byFirm.set(leave.firmId, [...(byFirm.get(leave.firmId) ?? []), leave]);
    for (const [firmId, leaves] of byFirm) {
      if (monday) await this.sendDigest(firmId, leaves.filter((l) => l.startDate <= weekEnd), `week:${todayKey}`, `📅 คนลาสัปดาห์นี้ (${formatBangkokDateThai(today)})`);
      await this.sendDigest(firmId, leaves.filter((l) => key(l.startDate) === key(threeDays)), `three:${todayKey}`, '📅 แจ้งลาล่วงหน้า 3 วัน');
      await this.sendDigest(firmId, leaves.filter((l) => l.startDate <= today && l.endDate >= today), `today:${todayKey}`, `📅 คนลาวันนี้ (${formatBangkokDateThai(today)})`);
    }
  }
}
