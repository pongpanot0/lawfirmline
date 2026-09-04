import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LineMessagingService } from '../line-messaging.service';
import { PrismaService } from '../../prisma/prisma.module';
import { ConversationTarget } from './line-conversation.types';

@Injectable()
export class LineNotificationService {
  constructor(
    private line: LineMessagingService,
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  async notifyCreated(params: {
    target: ConversationTarget;
    summaryText: string;
    assigneeUserId?: string | null;
    entityPath?: string;
  }): Promise<void> {
    const webUrl = this.config.get<string>('WEB_APP_URL') ?? 'http://localhost:3000';
    const link = params.entityPath ? `${webUrl}${params.entityPath}` : null;
    const groupMessage = link ? `${params.summaryText}\n\n🔗 ${link}` : params.summaryText;

    const groupOrRoomId = params.target.groupId ?? params.target.roomId;
    if (groupOrRoomId) {
      await this.line.pushTo(groupOrRoomId, groupMessage);
    }

    if (params.assigneeUserId) {
      const assignee = await this.prisma.user.findUnique({ where: { id: params.assigneeUserId } });
      if (assignee?.lineUserId) {
        const assigneeMessage = link
          ? `📌 คุณได้รับมอบหมายงานใหม่\n\n${params.summaryText}\n\n🔗 ${link}`
          : `📌 คุณได้รับมอบหมายงานใหม่\n\n${params.summaryText}`;
        await this.line.pushTo(assignee.lineUserId, assigneeMessage);
      }
    }
  }
}
