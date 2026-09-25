import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AuthUser, FirmRole } from '@lawfirm/shared';
import { LeaveType, Prisma } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.module';
import { LineMessagingService } from '../notifications/line-messaging.service';
import { addBangkokDays, bangkokDayKey, formatBangkokDateThai } from '../common/utils/bangkok-time';

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
  startDate: Date;
  endDate: Date;
  user: { firstName: string; lastName: string };
};

@Injectable()
export class LeaveService {
  private readonly logger = new Logger(LeaveService.name);
  constructor(private prisma: PrismaService, private line: LineMessagingService) {}

  async list(user: AuthUser, from: string, to: string) {
    const start = this.parseDate(from);
    const end = this.parseDate(to);
    if (end < start || end.getTime() - start.getTime() > 366 * 86400000) throw new BadRequestException('ช่วงวันที่ไม่ถูกต้อง');
    return this.prisma.leaveRequest.findMany({
      where: { firmId: user.firmId, startDate: { lte: end }, endDate: { gte: start } },
      include: { user: { select: { firstName: true, lastName: true } } },
      orderBy: { startDate: 'asc' },
    });
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
      where: { firmId: user.firmId, userId: user.id, startDate: { lte: endDate }, endDate: { gte: startDate } },
    });
    if (overlap) throw new BadRequestException('มีรายการลาทับช่วงนี้แล้ว');
    let leave: Leave;
    try {
      leave = await this.prisma.leaveRequest.create({
        data: { firmId: user.firmId, userId: user.id, type: input.type, startDate, endDate },
        include: { user: { select: { firstName: true, lastName: true } } },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new BadRequestException('มีรายการลาช่วงนี้แล้ว');
      throw error;
    }
    if (leave.type === LeaveType.SICK) {
      try { await this.sendSick(leave); }
      catch (error) { this.logger.error(`Sick leave ${leave.id} notice failed: ${(error as Error).message}`); }
    }
    return leave;
  }

  async cancel(user: AuthUser, id: string) {
    const leave = await this.prisma.leaveRequest.findFirst({
      where: { id, firmId: user.firmId },
      include: { user: { select: { firstName: true, lastName: true } } },
    });
    if (!leave) throw new NotFoundException('ไม่พบรายการลา');
    if (leave.userId !== user.id && user.firmRole !== FirmRole.OWNER) throw new ForbiddenException('ยกเลิกได้เฉพาะรายการลาของตนเอง');
    await this.prisma.leaveRequest.delete({ where: { id } });
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

  private label(leave: Leave, showRange = true) {
    const name = `${leave.user.firstName} ${leave.user.lastName}`.trim();
    const dates = leave.startDate.getTime() === leave.endDate.getTime()
      ? formatBangkokDateThai(leave.startDate)
      : `${formatBangkokDateThai(leave.startDate)}–${formatBangkokDateThai(leave.endDate)}`;
    return `${name} · ${LABEL[leave.type]}${showRange ? ` · ${dates}` : ''}`;
  }

  private async sendOnce(id: string, lineUserId: string, message: string) {
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
      const sent = await this.line.sendText(message.slice(0, 4900), [lineUserId]);
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
      where: { type: LeaveType.SICK, endDate: { gte: today }, createdAt: { gte: addBangkokDays(now, -400) } },
      include: { user: { select: { firstName: true, lastName: true } } },
    });
    for (const leave of sick) await this.sendSick(leave);

    const bangkokHour = (now.getUTCHours() + 7) % 24;
    if (bangkokHour < 8) return;
    const threeDays = day(bangkokDayKey(addBangkokDays(now, 3)));
    const weekEnd = day(bangkokDayKey(addBangkokDays(now, 6)));
    const monday = today.getUTCDay() === 1;
    const planned = await this.prisma.leaveRequest.findMany({
      where: { type: { in: [LeaveType.PERSONAL, LeaveType.VACATION] }, startDate: { lte: monday ? weekEnd : threeDays }, endDate: { gte: today } },
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
