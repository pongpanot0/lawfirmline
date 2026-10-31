import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AuthUser, FirmRole, hasFirmCapability, LawyerLicenseType, LicenseMilestone } from '@lawfirm/shared';
import { Prisma } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { AssignmentNotifierService } from '../notifications/assignment-notifier.service';
import { formatBangkokDateThai } from '../common/utils/bangkok-time';
import { daysToExpiry, dueMilestone } from './license-milestones';
import { UpdateLicenseDto } from './dto/lawyer-license.dto';

const LICENSE_SELECT = { lawyerLicenseNo: true, lawyerLicenseType: true, lawyerLicenseExpiresAt: true } as const;
const OFFICE_ROLES = [FirmRole.OWNER, FirmRole.OFFICE_MANAGER];

function milestoneText(milestone: LicenseMilestone, days: number): string {
  switch (milestone) {
    case 'OPEN_90':
    case 'DUE_30':
    case 'DUE_7':
      return `ใบอนุญาตทนายความจะหมดอายุในอีก ${days} วัน — ยื่นต่ออายุได้แล้ว`;
    case 'EXPIRED':
      return 'ใบอนุญาตทนายความหมดอายุแล้ว — ว่าความไม่ได้จนกว่าจะต่ออายุ';
    case 'LATE_45':
      return `ใบอนุญาตทนายความหมดอายุ ${-days} วัน — เหลือ ${60 + days} วันก่อนหมดสิทธิ์ต่ออายุแบบเสียค่าธรรมเนียมเพิ่ม`;
  }
}

@Injectable()
export class LawyerLicenseService {
  private readonly logger = new Logger(LawyerLicenseService.name);

  constructor(
    private prisma: PrismaService,
    private notifier: AssignmentNotifierService,
  ) {}

  async getMine(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: LICENSE_SELECT });
    if (!user) throw new NotFoundException('User not found');
    return { ...user, lawyerLicenseExpiresAt: user.lawyerLicenseExpiresAt?.toISOString().slice(0, 10) ?? null };
  }

  updateMine(user: AuthUser, dto: UpdateLicenseDto) {
    return this.apply(user, user.id, dto);
  }

  async updateMember(actor: AuthUser, targetUserId: string, dto: UpdateLicenseDto) {
    if (!hasFirmCapability(actor.firmRole, 'runOperations')) {
      throw new ForbiddenException('ไม่มีสิทธิ์แก้ใบอนุญาตของสมาชิก');
    }
    const member = await this.prisma.firmMember.findUnique({
      where: { firmId_userId: { firmId: actor.firmId, userId: targetUserId } },
    });
    if (!member) throw new NotFoundException('ไม่พบสมาชิก');
    return this.apply(actor, targetUserId, dto);
  }

  /** Omitted keys stay as stored; LIFETIME has no expiry and TWO_YEAR must have one. */
  private async apply(actor: AuthUser, targetUserId: string, dto: UpdateLicenseDto) {
    const current = await this.prisma.user.findUnique({ where: { id: targetUserId }, select: LICENSE_SELECT });
    if (!current) throw new NotFoundException('ไม่พบสมาชิก');

    const data: Prisma.UserUpdateInput = {};
    if (dto.lawyerLicenseNo !== undefined) data.lawyerLicenseNo = dto.lawyerLicenseNo?.trim() || null;
    if (dto.lawyerLicenseType !== undefined) data.lawyerLicenseType = dto.lawyerLicenseType;
    if (dto.lawyerLicenseExpiresAt !== undefined) {
      data.lawyerLicenseExpiresAt = dto.lawyerLicenseExpiresAt ? new Date(`${dto.lawyerLicenseExpiresAt}T00:00:00.000Z`) : null;
    }

    const type = dto.lawyerLicenseType !== undefined ? dto.lawyerLicenseType : current.lawyerLicenseType;
    const expiresAt = data.lawyerLicenseExpiresAt !== undefined ? data.lawyerLicenseExpiresAt : current.lawyerLicenseExpiresAt;
    if (type === LawyerLicenseType.LIFETIME) {
      if (dto.lawyerLicenseExpiresAt) throw new BadRequestException('ใบอนุญาตตลอดชีพไม่มีวันหมดอายุ');
      data.lawyerLicenseExpiresAt = null;
    } else if (type === LawyerLicenseType.TWO_YEAR && !expiresAt) {
      throw new BadRequestException('ใบอนุญาตแบบ 2 ปีต้องระบุวันหมดอายุ');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: targetUserId }, data });
      await tx.auditLog.create({
        data: {
          firmId: actor.firmId,
          userId: actor.id,
          action: 'LAWYER_LICENSE_UPDATED',
          metadata: { targetUserId, ...dto },
        },
      });
    });
    return { success: true };
  }

  /** 08:00 Bangkok daily. One log row per (user, expiry, milestone) is the send claim. */
  @Cron('0 8 * * *', { timeZone: 'Asia/Bangkok' })
  async sendLicenseReminders(now: Date = new Date()) {
    const users = await this.prisma.user.findMany({
      where: { lawyerLicenseType: LawyerLicenseType.TWO_YEAR, lawyerLicenseExpiresAt: { not: null } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        lawyerLicenseExpiresAt: true,
        firmMembers: { select: { firmId: true }, orderBy: { createdAt: 'asc' } },
      },
    });
    if (!users.length) return;

    const logs = await this.prisma.lawyerLicenseReminderLog.findMany({
      where: { userId: { in: users.map((u) => u.id) } },
      select: { userId: true, expiresAt: true, milestone: true },
    });

    for (const user of users) {
      try {
        const expiresAt = user.lawyerLicenseExpiresAt!;
        const sent = new Set(
          logs
            .filter((l) => l.userId === user.id && l.expiresAt.getTime() === expiresAt.getTime())
            .map((l) => l.milestone),
        );
        const milestone = dueMilestone(expiresAt, now, sent);
        if (!milestone || !user.firmMembers.length) continue;
        if (!(await this.claim(user.id, expiresAt, milestone))) continue;
        await this.notify(user, expiresAt, milestone, now);
      } catch (err) {
        this.logger.error(`Licence reminder failed for user ${user.id}`, err);
      }
    }
  }

  private async claim(userId: string, expiresAt: Date, milestone: LicenseMilestone): Promise<boolean> {
    try {
      await this.prisma.lawyerLicenseReminderLog.create({ data: { userId, expiresAt, milestone } });
      return true;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return false;
      throw err;
    }
  }

  private async notify(
    user: { id: string; firstName: string; lastName: string; firmMembers: { firmId: string }[] },
    expiresAt: Date,
    milestone: LicenseMilestone,
    now: Date,
  ) {
    const text = milestoneText(milestone, daysToExpiry(expiresAt, now));
    const expiry = formatBangkokDateThai(expiresAt);
    // The lawyer once (inbox under their first firm), each firm's office separately.
    await this.notifier.notifyAssigned({
      firmId: user.firmMembers[0].firmId,
      userIds: [user.id],
      actorUserId: '',
      category: 'LICENSE',
      summaryText: `${text}\nวันหมดอายุ ${expiry}`,
      entityPath: '/settings?view=profile',
    });
    for (const { firmId } of user.firmMembers) {
      const office = await this.prisma.firmMember.findMany({
        where: { firmId, role: { in: OFFICE_ROLES } },
        select: { userId: true },
      });
      const userIds = office.map((m) => m.userId).filter((id) => id !== user.id);
      if (!userIds.length) continue;
      await this.notifier.notifyAssigned({
        firmId,
        userIds,
        actorUserId: '',
        category: 'LICENSE',
        summaryText: `${user.firstName} ${user.lastName}: ${text}\nวันหมดอายุ ${expiry}`,
        entityPath: '/team',
      });
    }
  }
}
