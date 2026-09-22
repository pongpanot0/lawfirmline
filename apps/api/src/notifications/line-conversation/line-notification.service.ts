import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LineMessagingService } from '../line-messaging.service';
import { PrismaService } from '../../prisma/prisma.module';
import { ConversationTarget } from './line-conversation.types';
import { FirmLinkService } from '../firm-link.service';

@Injectable()
export class LineNotificationService {
  constructor(
    private line: LineMessagingService,
    private prisma: PrismaService,
    private config: ConfigService,
    private firmLink: FirmLinkService,
  ) {}

  async notifyCreated(params: {
    firmId: string;
    target: ConversationTarget;
    summaryText: string;
    assigneeUserId?: string | null;
    entityPath?: string;
    /** Headline of the direct message to the assignee/recipient. */
    dmHeadline?: string;
  }): Promise<void> {
    const link = params.entityPath
      ? await this.firmLink.linkFor(params.firmId, params.entityPath)
      : null;
    const groupMessage = link ? `${params.summaryText}\n\n🔗 ${link}` : params.summaryText;

    const groupOrRoomId = params.target.groupId ?? params.target.roomId;
    if (groupOrRoomId) {
      await this.line.pushTo(groupOrRoomId, groupMessage);
    }

    if (params.assigneeUserId) {
      const assignee = await this.prisma.user.findUnique({ where: { id: params.assigneeUserId } });
      if (assignee?.lineUserId) {
        const headline = params.dmHeadline ?? '📌 คุณได้รับมอบหมายงานใหม่';
        const assigneeMessage = link
          ? `${headline}\n\n${params.summaryText}\n\n🔗 ${link}`
          : `${headline}\n\n${params.summaryText}`;
        await this.line.pushTo(assignee.lineUserId, assigneeMessage);
      }
    }
  }
}
