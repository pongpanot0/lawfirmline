import { Injectable } from '@nestjs/common';
import { LineMessagingService } from '../line-messaging.service';
import { ConversationTarget } from './line-conversation.types';
import { FirmLinkService } from '../firm-link.service';
import { AssignmentNotifierService } from '../assignment-notifier.service';
import { NotificationCategory } from '../../generated/prisma';

@Injectable()
export class LineNotificationService {
  constructor(
    private line: LineMessagingService,
    private firmLink: FirmLinkService,
    private notifier: AssignmentNotifierService,
  ) {}

  async notifyCreated(params: {
    firmId: string;
    target: ConversationTarget;
    summaryText: string;
    assigneeUserId?: string | null;
    entityPath?: string;
    /** Headline of the direct message to the assignee/recipient. */
    dmHeadline?: string;
    /** What the assignee mutes this under; defaults to TASK. */
    category?: NotificationCategory;
  }): Promise<void> {
    const link = params.entityPath
      ? await this.firmLink.linkFor(params.firmId, params.entityPath)
      : null;
    const groupMessage = link ? `${params.summaryText}\n\n🔗 ${link}` : params.summaryText;

    const groupOrRoomId = params.target.groupId ?? params.target.roomId;
    if (groupOrRoomId) {
      await this.line.pushTo(groupOrRoomId, groupMessage);
    }

    // The assignee hears through the hub: inbox, push, and LINE subject to their preferences.
    // No actor is excluded — creating work for yourself over LINE still files it in your inbox.
    if (params.assigneeUserId) {
      await this.notifier.notifyAssigned({
        firmId: params.firmId,
        userIds: [params.assigneeUserId],
        actorUserId: '',
        category: params.category ?? NotificationCategory.TASK,
        summaryText: `${params.dmHeadline ?? '📌 คุณได้รับมอบหมายงานใหม่'}\n${params.summaryText}`,
        entityPath: params.entityPath ?? '/todos',
      });
    }
  }
}
