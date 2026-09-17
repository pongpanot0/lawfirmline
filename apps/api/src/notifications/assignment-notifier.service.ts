import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FirmRole } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { LineMessagingService } from './line-messaging.service';

/**
 * Fire-and-forget LINE DMs for assignment/approval events. Depends only on
 * Prisma + LineMessagingService so feature modules can import it (via
 * NotificationsModule forwardRef) without deep cycles. A send failure is
 * logged and swallowed — it must never fail the mutation that triggered it.
 */
@Injectable()
export class AssignmentNotifierService {
  private readonly logger = new Logger(AssignmentNotifierService.name);

  constructor(
    private prisma: PrismaService,
    private line: LineMessagingService,
    private config: ConfigService,
  ) {}

  async notifyAssigned(params: {
    userIds: string[];
    actorUserId: string;
    summaryText: string;
    entityPath: string;
  }): Promise<void> {
    try {
      const targets = [...new Set(params.userIds)].filter((id) => id !== params.actorUserId);
      if (!targets.length) return;
      const users = await this.prisma.user.findMany({
        where: { id: { in: targets } },
        select: { id: true, lineUserId: true },
      });
      const webUrl = this.config.get<string>('WEB_APP_URL') ?? 'http://localhost:3000';
      const message = `${params.summaryText}\n\n🔗 ${webUrl}${params.entityPath}`;
      for (const u of users) {
        if (!u.lineUserId) continue;
        try {
          await this.line.pushTo(u.lineUserId, message);
        } catch (err) {
          this.logger.error(`Failed to DM user ${u.id}`, err);
        }
      }
    } catch (err) {
      this.logger.error('Failed to send assignment notification', err);
    }
  }

  async notifyFirmOwners(params: {
    firmId: string;
    actorUserId: string;
    summaryText: string;
    entityPath: string;
  }): Promise<void> {
    try {
      const owners = await this.prisma.firmMember.findMany({
        where: { firmId: params.firmId, role: FirmRole.OWNER },
        select: { userId: true },
      });
      await this.notifyAssigned({
        userIds: owners.map((o) => o.userId),
        actorUserId: params.actorUserId,
        summaryText: params.summaryText,
        entityPath: params.entityPath,
      });
    } catch (err) {
      this.logger.error('Failed to notify firm owners', err);
    }
  }
}
