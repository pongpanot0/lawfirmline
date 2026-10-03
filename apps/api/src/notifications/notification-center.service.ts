import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { NotificationCategory } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.module';

const PAGE_SIZE = 30;
/** Inbox rows older than this are pruned; the work itself lives on in its own screens. */
const RETENTION_DAYS = 90;

export interface ChannelSwitches {
  push: boolean;
  line: boolean;
}

/** The staff inbox and per-category channel preferences. */
@Injectable()
export class NotificationCenterService {
  private readonly logger = new Logger(NotificationCenterService.name);

  constructor(private prisma: PrismaService) {}

  async list(userId: string, firmId: string, cursor?: string) {
    const rows = await this.prisma.notification.findMany({
      where: { userId, firmId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: PAGE_SIZE + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      select: {
        id: true, category: true, title: true, body: true,
        path: true, appPath: true, readAt: true, createdAt: true,
      },
    });
    const items = rows.slice(0, PAGE_SIZE);
    return { items, nextCursor: rows.length > PAGE_SIZE ? items[items.length - 1].id : null };
  }

  async unreadCount(userId: string, firmId: string) {
    return { count: await this.prisma.notification.count({ where: { userId, firmId, readAt: null } }) };
  }

  /** Unread counts for many recipients in one query — the push badge. */
  async unreadCounts(userIds: string[], firmId: string): Promise<Map<string, number>> {
    const rows = await this.prisma.notification.groupBy({
      by: ['userId'],
      where: { userId: { in: userIds }, firmId, readAt: null },
      _count: { _all: true },
    });
    return new Map(rows.map((row) => [row.userId, row._count._all]));
  }

  async markRead(userId: string, id: string) {
    // Scoped to the caller: an id alone never marks someone else's inbox.
    await this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }

  async markAllRead(userId: string, firmId: string) {
    const { count } = await this.prisma.notification.updateMany({
      where: { userId, firmId, readAt: null },
      data: { readAt: new Date() },
    });
    return { count };
  }

  async preferences(userId: string) {
    const rows = await this.prisma.userNotificationPreference.findMany({ where: { userId } });
    const saved = new Map(rows.map((row) => [row.category, row]));
    return Object.values(NotificationCategory).map((category) => ({
      category,
      push: saved.get(category)?.push ?? true,
      line: saved.get(category)?.line ?? true,
    }));
  }

  async setPreference(userId: string, category: NotificationCategory, change: Partial<ChannelSwitches>) {
    const row = await this.prisma.userNotificationPreference.upsert({
      where: { userId_category: { userId, category } },
      create: { userId, category, push: change.push ?? true, line: change.line ?? true },
      update: change,
    });
    return { category, push: row.push, line: row.line };
  }

  /** Channel switches per recipient for one category; anyone without a saved row gets everything. */
  async channelsFor(userIds: string[], category: NotificationCategory): Promise<Map<string, ChannelSwitches>> {
    const rows = await this.prisma.userNotificationPreference.findMany({
      where: { userId: { in: userIds }, category },
    });
    const saved = new Map(rows.map((row) => [row.userId, row]));
    return new Map(userIds.map((id) => [id, { push: saved.get(id)?.push ?? true, line: saved.get(id)?.line ?? true }]));
  }

  @Cron('15 3 * * *', { timeZone: 'Asia/Bangkok' })
  async prune() {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000);
    const { count } = await this.prisma.notification.deleteMany({ where: { createdAt: { lt: cutoff } } });
    if (count) this.logger.log(`Pruned ${count} notifications older than ${RETENTION_DAYS} days`);
  }
}
