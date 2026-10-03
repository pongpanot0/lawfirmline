import { Injectable, Logger } from '@nestjs/common';
import { FirmRole } from '@lawfirm/shared';
import { NotificationCategory } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.module';
import { LineMessagingService } from './line-messaging.service';
import { FirmLinkService } from './firm-link.service';
import { PushService } from './push.service';
import { NotificationCenterService } from './notification-center.service';
import { toAppRoute } from './app-route';

export interface NotifyParams {
  /** Null only when the trigger has no firm in hand (a standalone todo); the
   *  firm is then taken from the recipient's own membership. */
  firmId: string | null;
  userIds: string[];
  /** Never notified about their own action; '' for system triggers. */
  actorUserId: string;
  category: NotificationCategory;
  /** First line becomes the title, the rest the body. */
  summaryText: string;
  /** Web path — the LINE link and the inbox fallback. */
  entityPath: string;
  /** Mobile route, when the web path does not point at the exact screen (e.g. the task itself). */
  appPath?: string;
  /** false when the caller sends its own LINE message (quick replies, its own dedupe). */
  line?: boolean;
}

export interface NotifyResult {
  recipients: number;
  push: boolean;
  line: boolean;
}

const NOTHING_SENT: NotifyResult = { recipients: 0, push: false, line: false };

/** Expo rejects a message over ~4 KB; Thai is 3 bytes a character, so stay well under. */
const PUSH_TITLE_MAX = 120;
const PUSH_BODY_MAX = 400;
const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/**
 * The one place staff notifications go out: an inbox row for every recipient,
 * then mobile push and a LINE DM, each subject to the recipient's per-category
 * preferences. Depends only on notification-layer services so feature modules
 * can import it (via NotificationsModule forwardRef) without deep cycles. A
 * failure is logged and swallowed — it must never fail the mutation that
 * triggered it.
 */
@Injectable()
export class AssignmentNotifierService {
  private readonly logger = new Logger(AssignmentNotifierService.name);

  constructor(
    private prisma: PrismaService,
    private line: LineMessagingService,
    private firmLink: FirmLinkService,
    private push: PushService,
    private center: NotificationCenterService,
  ) {}

  async notifyAssigned(params: NotifyParams): Promise<NotifyResult> {
    try {
      const targets = [...new Set(params.userIds)].filter((id) => id && id !== params.actorUserId);
      if (!targets.length) return NOTHING_SENT;
      const users = await this.prisma.user.findMany({
        where: { id: { in: targets } },
        select: {
          id: true,
          lineUserId: true,
          firmMembers: { select: { firmId: true }, orderBy: { createdAt: 'asc' }, take: 1 },
        },
      });
      // Without a firm in hand each recipient's own firm is used, so a
      // multi-firm group never files a row under someone else's firm.
      const byFirm = new Map<string, typeof users>();
      for (const u of users) {
        const firmId = params.firmId ?? u.firmMembers[0]?.firmId;
        if (firmId) byFirm.set(firmId, [...(byFirm.get(firmId) ?? []), u]);
      }

      const result = { ...NOTHING_SENT };
      for (const [firmId, group] of byFirm) {
        const userIds = group.map((u) => u.id);
        const channels = await this.center.channelsFor(userIds, params.category);
        const notificationIds = await this.recordInbox(firmId, userIds, params);
        const push = await this.sendPush(firmId, userIds, channels, notificationIds, params);
        const line = params.line === false
          ? false
          : await this.sendLine(firmId, group.filter((u) => channels.get(u.id)?.line), params);
        result.recipients += group.length;
        result.push ||= push;
        result.line ||= line;
      }
      return result;
    } catch (err) {
      this.logger.error('Failed to send notification', err);
      return NOTHING_SENT;
    }
  }

  async notifyFirmOwners(params: Omit<NotifyParams, 'userIds' | 'firmId'> & { firmId: string }): Promise<void> {
    try {
      const owners = await this.prisma.firmMember.findMany({
        where: { firmId: params.firmId, role: FirmRole.OWNER },
        select: { userId: true },
      });
      await this.notifyAssigned({ ...params, userIds: owners.map((o) => o.userId) });
    } catch (err) {
      this.logger.error('Failed to notify firm owners', err);
    }
  }

  private appPath(params: NotifyParams) {
    return params.appPath ?? toAppRoute(params.entityPath);
  }

  /** userId → inbox row id. An inbox failure still lets push and LINE go out. */
  private async recordInbox(firmId: string, userIds: string[], params: NotifyParams) {
    const [title, ...rest] = params.summaryText.split('\n');
    try {
      const rows = await this.prisma.notification.createManyAndReturn({
        data: userIds.map((userId) => ({
          firmId,
          userId,
          category: params.category,
          title: title.trim(),
          body: rest.join('\n').trim() || null,
          path: params.entityPath,
          appPath: this.appPath(params),
        })),
        select: { id: true, userId: true },
      });
      return new Map(rows.map((row) => [row.userId, row.id]));
    } catch (err) {
      this.logger.error('Failed to record notification inbox rows', err);
      return new Map<string, string>();
    }
  }

  private async sendPush(
    firmId: string,
    userIds: string[],
    channels: Map<string, { push: boolean }>,
    notificationIds: Map<string, string>,
    params: NotifyParams,
  ): Promise<boolean> {
    const recipients = userIds.filter((id) => channels.get(id)?.push);
    if (!recipients.length) return false;
    try {
      const [title, ...rest] = params.summaryText.split('\n');
      const badges = notificationIds.size ? await this.center.unreadCounts(recipients, firmId) : new Map<string, number>();
      return await this.push.send(recipients.map((userId) => {
        const notificationId = notificationIds.get(userId);
        return {
          userId,
          title: clip(title.trim(), PUSH_TITLE_MAX),
          body: clip(rest.join('\n').trim(), PUSH_BODY_MAX),
          data: {
            url: this.appPath(params) ?? '/notifications',
            ...(notificationId && { notificationId }),
          },
          ...(notificationIds.size && { badge: badges.get(userId) ?? 0 }),
        };
      }));
    } catch (err) {
      this.logger.error('Failed to send push notifications', err);
      return false;
    }
  }

  private async sendLine(
    firmId: string,
    users: Array<{ id: string; lineUserId: string | null }>,
    params: NotifyParams,
  ): Promise<boolean> {
    const linked = users.filter((u) => u.lineUserId);
    if (!linked.length) return false;
    const link = await this.firmLink.linkFor(firmId, params.entityPath);
    const message = `${params.summaryText}\n\n🔗 ${link}`;
    let sent = false;
    for (const u of linked) {
      try {
        if (await this.line.pushTo(u.lineUserId!, message)) sent = true;
      } catch (err) {
        this.logger.error(`Failed to DM user ${u.id}`, err);
      }
    }
    return sent;
  }
}
