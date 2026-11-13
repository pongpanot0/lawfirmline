import { Injectable, Logger } from '@nestjs/common';
import { Notification, NotificationCategory, Prisma } from '../generated/prisma';
import { NotificationCenterService } from '../notifications/notification-center.service';
import { PushService } from '../notifications/push.service';

/** Inbox and business record commit together; push follows the recipient's category preference. */
@Injectable()
export class CoachingNotifierService {
  private readonly logger = new Logger(CoachingNotifierService.name);
  constructor(private center: NotificationCenterService, private push: PushService) {}

  record(db: Pick<Prisma.TransactionClient, 'notification'>, firmId: string, userId: string, category: NotificationCategory, title: string, path: string) {
    return db.notification.create({ data: { firmId, userId, category, title, path, appPath: null } });
  }

  // shortcut: push after commit is best effort; add an outbox when delivery retries are required.
  async send(notification: Notification): Promise<void> {
    try {
      const channels = await this.center.channelsFor([notification.userId], notification.category);
      if (!channels.get(notification.userId)?.push) return;
      const counts = await this.center.unreadCounts([notification.userId], notification.firmId);
      await this.push.send([{ userId: notification.userId, title: notification.title, body: notification.body ?? '',
        data: { url: notification.appPath ?? '/notifications', notificationId: notification.id }, badge: counts.get(notification.userId) ?? 0 }]);
    } catch (err) {
      this.logger.error('Failed to send coaching/standup push', err);
    }
  }
}
