import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '@lawfirm/shared';
import { randomUUID } from 'crypto';
import { AppFeedbackKind, Prisma } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.module';
import { FileStorageService } from '../common/services/file-storage.service';
import { LineMessagingService } from '../notifications/line-messaging.service';
import { CreateAppFeedbackDto, FeedbackCommentsQueryDto, FeedbackPagesQueryDto, FeedbackQueryDto } from './dto/app-feedback.dto';

export const FEEDBACK_MAX_BYTES = 10 * 1024 * 1024;
const IMAGE_EXTENSIONS: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
const person = { select: { id: true, firstName: true, lastName: true } } as const;
const firm = { select: { id: true, name: true } } as const;
const withMessage = { not: null, notIn: [''] };
const visible: Prisma.AppFeedbackWhereInput = { OR: [{ kind: { not: 'RATING' } }, { message: withMessage }] };
const publicPerson = (user: { id: string; firstName: string; lastName: string }) => ({ id: user.id, name: `${user.firstName} ${user.lastName}`.trim() });
const since = (days = 90) => new Date(Math.max(0, Date.now() - days * 86_400_000));

@Injectable()
export class AppFeedbackService {
  private readonly logger = new Logger(AppFeedbackService.name);

  constructor(private prisma: PrismaService, private storage: FileStorageService, private line: LineMessagingService) {}

  async create(user: AuthUser, dto: CreateAppFeedbackDto, screenshot?: Express.Multer.File) {
    if (!user.firmId) throw new ForbiddenException('ต้องเป็นสมาชิกสำนักงาน');
    if (!Object.values(AppFeedbackKind).includes(dto.kind) || !['web', 'ios', 'android'].includes(dto.platform)) {
      throw new BadRequestException('ประเภทหรือแพลตฟอร์มไม่ถูกต้อง');
    }
    if (dto.message !== undefined && (typeof dto.message !== 'string' || dto.message.length > 500)) {
      throw new BadRequestException('ข้อความต้องไม่เกิน 500 ตัวอักษร');
    }
    for (const value of [dto.route, dto.appVersion]) {
      if (value !== undefined && typeof value !== 'string') throw new BadRequestException('ข้อมูลแอปไม่ถูกต้อง');
    }
    const message = dto.message?.trim() || null;
    if (dto.kind === 'RATING') {
      if (!Number.isInteger(dto.rating) || ![1, 2, 3].includes(dto.rating!)) throw new BadRequestException('คะแนนต้องเป็น 1–3');
      if (screenshot) throw new BadRequestException('การให้คะแนนแนบรูปไม่ได้');
    } else {
      if (!message) throw new BadRequestException('กรุณาระบุข้อความ');
      if (dto.rating !== undefined) throw new BadRequestException('คะแนนใช้ได้เฉพาะ RATING');
    }
    if (screenshot && (!Object.prototype.hasOwnProperty.call(IMAGE_EXTENSIONS, screenshot.mimetype) || screenshot.size > FEEDBACK_MAX_BYTES || screenshot.buffer.length > FEEDBACK_MAX_BYTES)) {
      throw new BadRequestException('รองรับ PNG, JPEG, WebP ขนาดไม่เกิน 10MB');
    }
    let screenshotPath: string | undefined;
    if (screenshot) {
      const key = `app-feedback/${new Date().getUTCFullYear()}/${randomUUID()}.${IMAGE_EXTENSIONS[screenshot.mimetype]}`;
      screenshotPath = await this.storage.put(key, screenshot.buffer, screenshot.mimetype);
    }
    try {
      return await this.prisma.appFeedback.create({
        data: {
          kind: dto.kind, source: dto.platform === 'web' ? 'WEB' : 'MOBILE', rating: dto.rating,
          message, route: dto.route?.slice(0, 300), platform: dto.platform, appVersion: dto.appVersion?.slice(0, 40),
          userId: user.id, firmId: user.firmId, screenshotPath, screenshotMime: screenshot?.mimetype,
        },
        select: { id: true },
      });
    } catch (error) {
      if (screenshotPath) {
        try { await this.storage.delete(screenshotPath); } catch { /* Preserve the DB failure if cleanup fails. */ }
      }
      throw error;
    }
  }

  async list(query: FeedbackQueryDto) {
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
    const q = query.q?.trim();
    const where: Prisma.AppFeedbackWhereInput = {
      AND: [visible],
      ...((query.status ?? 'open') === 'open' && { resolvedAt: null }),
      ...(query.status === 'resolved' && { resolvedAt: { not: null } }),
      ...(query.kind && { kind: query.kind }),
      ...(query.firmId && { firmId: query.firmId }),
      ...(q && { OR: [
        { message: { contains: q, mode: 'insensitive' } }, { route: { contains: q, mode: 'insensitive' } },
        { user: { firstName: { contains: q, mode: 'insensitive' } } }, { user: { lastName: { contains: q, mode: 'insensitive' } } },
      ] }),
    };
    const rows = await this.prisma.appFeedback.findMany({
      where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit + 1,
      ...(query.cursor && { cursor: { id: query.cursor }, skip: 1 }),
      select: {
        id: true, kind: true, source: true, rating: true, message: true, route: true, platform: true, appVersion: true,
        screenshotPath: true, createdAt: true, resolvedAt: true, user: person, firm,
      },
    });
    const items = rows.slice(0, limit).map(({ screenshotPath, user, ...row }) => ({ ...row, hasScreenshot: Boolean(screenshotPath), user: publicPerson(user) }));
    return { items, nextCursor: rows.length > limit ? items[items.length - 1].id : null };
  }

  async summary() {
    return { open: await this.prisma.appFeedback.count({ where: { AND: [visible], resolvedAt: null } }) };
  }

  async setResolved(ids: string[], resolved: boolean, by: string) {
    const { count } = await this.prisma.appFeedback.updateMany({
      where: { id: { in: ids } },
      data: resolved ? { resolvedAt: new Date(), resolvedBy: by } : { resolvedAt: null, resolvedBy: null },
    });
    return { count };
  }

  async screenshot(id: string) {
    const row = await this.prisma.appFeedback.findUnique({ where: { id }, select: { screenshotPath: true, screenshotMime: true } });
    if (!row?.screenshotPath) throw new NotFoundException('ไม่พบรูปภาพ');
    return row;
  }

  async pages(query: FeedbackPagesQueryDto) {
    const rows = await this.prisma.appFeedback.groupBy({
      by: ['route', 'platform', 'rating'],
      where: { kind: 'RATING', route: { not: null }, createdAt: { gte: since(query.days) }, ...(query.platform && { platform: query.platform }) },
      _count: { _all: true, message: true },
    });
    const pages = new Map<string, { route: string; platform: string | null; responses: number; bad: number; ok: number; good: number; comments: number }>();
    for (const row of rows) {
      const key = JSON.stringify([row.route, row.platform]);
      const page = pages.get(key) ?? { route: row.route!, platform: row.platform, responses: 0, bad: 0, ok: 0, good: 0, comments: 0 };
      page.responses += row._count._all;
      page.bad += row.rating === 1 ? row._count._all : 0;
      page.ok += row.rating === 2 ? row._count._all : 0;
      page.good += row.rating === 3 ? row._count._all : 0;
      page.comments += row._count.message;
      pages.set(key, page);
    }
    return [...pages.values()].sort((a, b) => b.bad / b.responses - a.bad / a.responses || b.responses - a.responses);
  }

  async pageComments(query: FeedbackCommentsQueryDto) {
    const rows = await this.prisma.appFeedback.findMany({
      where: { kind: 'RATING', route: query.route, message: withMessage, createdAt: { gte: since(query.days) }, ...(query.platform && { platform: query.platform }) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 20,
      select: { id: true, rating: true, message: true, createdAt: true, user: person, firm },
    });
    return rows.map(({ user, ...row }) => ({ ...row, user: publicPerson(user) }));
  }

  /**
   * The LINE bot acts as the user's oldest membership and treats an EXTERNAL one as unlinked
   * (LineAuthContextService → TenantService.buildAuthUser), so only survey people whose oldest
   * membership is staff: anyone else could never record an answer.
   */
  private async recipients() {
    const users = await this.prisma.user.findMany({
      where: { lineUserId: { not: null }, firmMembers: { some: { role: { not: 'EXTERNAL' } } } },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        lineUserId: true,
        firmMembers: {
          orderBy: { createdAt: 'asc' },
          take: 1,
          select: { firmId: true, role: true, firm: { select: { name: true } } },
        },
      },
    });
    return users.filter((user) => user.firmMembers[0]?.role !== 'EXTERNAL');
  }

  async lineRounds() {
    const recipients = await this.recipients();
    const rounds = await this.prisma.appFeedbackLineRound.findMany({ orderBy: [{ sentAt: 'desc' }, { id: 'desc' }], select: { id: true, sentAt: true, recipientCount: true } });
    const answers = await this.prisma.appFeedback.groupBy({ by: ['lineRoundId', 'rating'], where: { source: 'LINE', kind: 'RATING', lineRoundId: { not: null } }, _count: { _all: true, message: true } });
    return {
      recipients: {
        users: recipients.length,
        firms: new Set(recipients.flatMap((user) => user.firmMembers.map((member) => member.firmId))).size,
        // Who a round would reach, so an admin can check or pick a few people to test with first.
        people: recipients.map((user) => ({
          id: user.id,
          name: `${user.firstName} ${user.lastName}`.trim(),
          firm: user.firmMembers[0]?.firm.name ?? null,
        })),
      },
      lastSentAt: rounds[0]?.sentAt ?? null,
      rounds: rounds.map((round) => {
        const rows = answers.filter((answer) => answer.lineRoundId === round.id);
        const count = (rating: number) => rows.filter((row) => row.rating === rating).reduce((sum, row) => sum + row._count._all, 0);
        return { ...round, answered: rows.reduce((sum, row) => sum + row._count._all, 0), bad: count(1), ok: count(2), good: count(3), comments: rows.reduce((sum, row) => sum + row._count.message, 0) };
      }),
    };
  }

  /**
   * `userIds` narrows the round to chosen people (e.g. a test send to oneself). Every id must be an
   * eligible recipient: the list comes from the browser, so it never widens who can be messaged.
   */
  async sendLineRound(sentById: string, userIds?: string[]) {
    let recipients = await this.recipients();
    if (userIds) {
      const chosen = new Set(userIds);
      recipients = recipients.filter((user) => chosen.has(user.id));
      if (!recipients.length || recipients.length !== chosen.size) {
        throw new BadRequestException('เลือกผู้รับได้เฉพาะพนักงานที่เชื่อม LINE แล้ว');
      }
    }
    const round = await this.prisma.appFeedbackLineRound.create({ data: { sentById, recipientCount: recipients.length } });
    const quickReply = ['😞 ใช้ยาก', '😐 พอใช้', '😊 ใช้ง่าย'].map((label, index) => ({ label, text: label, data: `fbk:${round.id}:${index + 1}` }));
    let delivered = 0;
    for (const user of recipients) {
      try {
        if (await this.line.pushTo(user.lineUserId!, 'การใช้งาน Samnuan ช่วงนี้เป็นยังไงบ้างครับ?', quickReply)) delivered++;
      } catch (error) {
        this.logger.warn(`Feedback round delivery failed for user ${user.id}: ${String(error)}`);
      }
    }
    return { id: round.id, recipientCount: recipients.length, delivered };
  }

  async lineRating(user: AuthUser, roundId: string, rating: number) {
    if (![1, 2, 3].includes(rating)) throw new BadRequestException('คะแนนต้องเป็น 1–3');
    if (!await this.prisma.appFeedbackLineRound.findUnique({ where: { id: roundId }, select: { id: true } })) return null;
    return this.prisma.appFeedback.upsert({
      where: { lineRoundId_userId: { lineRoundId: roundId, userId: user.id } },
      create: { kind: 'RATING', source: 'LINE', rating, lineRoundId: roundId, userId: user.id, firmId: user.firmId || null },
      update: { rating }, select: { id: true },
    });
  }

  async lineDetail(id: string, userId: string, text: string) {
    await this.prisma.appFeedback.updateMany({ where: { id, userId, source: 'LINE', kind: 'RATING' }, data: { message: text.slice(0, 500).trim() || null } });
  }
}
