import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.module';
import { LinkCodeAttemptLimiterService } from './link-code-attempt-limiter.service';

const LINK_CODE_TTL_MS = 15 * 60 * 1000;
const LINK_CODE_PATTERN = /^LF-[A-Z0-9]{6}$/i;

@Injectable()
export class LineLinkService {
  private readonly logger = new Logger(LineLinkService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private limiter: LinkCodeAttemptLimiterService,
  ) {}

  getOfficialAccountUrl(): string | null {
    const basicId = this.config.get<string>('LINE_OA_BASIC_ID');
    if (!basicId) return null;
    const normalized = basicId.startsWith('@') ? basicId.slice(1) : basicId;
    return `https://line.me/R/ti/p/@${normalized}`;
  }

  async getPersonalStatus(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        lineUserId: true,
        lineConnectedAt: true,
        lineLinkCode: true,
        lineLinkCodeExpiresAt: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');

    const pendingLink =
      user.lineLinkCode &&
      user.lineLinkCodeExpiresAt &&
      user.lineLinkCodeExpiresAt.getTime() > Date.now();

    return {
      connected: Boolean(user.lineUserId),
      connectedAt: user.lineConnectedAt?.toISOString() ?? null,
      pendingLinkCode: pendingLink ? user.lineLinkCode : null,
      pendingLinkExpiresAt: pendingLink
        ? user.lineLinkCodeExpiresAt!.toISOString()
        : null,
      officialAccountUrl: this.getOfficialAccountUrl(),
    };
  }

  async createLinkCode(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.lineUserId) {
      throw new BadRequestException('LINE account is already connected');
    }

    const code = await this.generateLinkCode();
    const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MS);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        lineLinkCode: code,
        lineLinkCodeExpiresAt: expiresAt,
      },
    });

    return {
      code,
      expiresAt: expiresAt.toISOString(),
      officialAccountUrl: this.getOfficialAccountUrl(),
    };
  }

  async disconnect(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        lineUserId: null,
        lineConnectedAt: null,
        lineLinkCode: null,
        lineLinkCodeExpiresAt: null,
      },
    });

    return { ok: true };
  }

  async handleIncomingMessage(lineUserId: string, text: string): Promise<string | null> {
    const trimmed = text.trim().toUpperCase();
    if (!LINK_CODE_PATTERN.test(trimmed)) return null;

    if (!this.limiter.recordAttempt(lineUserId)) {
      return '❌ พยายามเชื่อมต่อบ่อยเกินไป กรุณาลองใหม่ภายหลัง';
    }

    const user = await this.prisma.user.findUnique({
      where: { lineLinkCode: trimmed },
    });

    const GENERIC_FAILURE_MESSAGE =
      '❌ ไม่สามารถเชื่อมต่อได้ กรุณาสร้างรหัสใหม่จาก Settings และลองอีกครั้ง';

    if (!user) {
      return null;
    }

    if (
      !user.lineLinkCodeExpiresAt ||
      user.lineLinkCodeExpiresAt.getTime() < Date.now()
    ) {
      return GENERIC_FAILURE_MESSAGE;
    }

    const existing = await this.prisma.user.findUnique({
      where: { lineUserId },
    });
    if (existing && existing.id !== user.id) {
      return GENERIC_FAILURE_MESSAGE;
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        lineUserId,
        lineConnectedAt: new Date(),
        lineLinkCode: null,
        lineLinkCodeExpiresAt: null,
      },
    });

    this.limiter.reset(lineUserId);
    this.logger.log(`Linked LINE user ${lineUserId} to LexFlow user ${user.id}`);
    return `✅ เชื่อมต่อสำเร็จ!\nสวัสดีคุณ ${user.firstName} คุณจะได้รับแจ้งเตือนนัดหมายล่วงหน้า 3 วันก่อนถึงวันนัด`;
  }

  /**
   * Who to remind about one event.
   *
   * A per-event reminder is a countdown for whoever has to be there, so it goes
   * to the event's assignee, and to the case's lead lawyer only when nobody was
   * named. Sending it to everyone staffed on the case — which is what
   * `getLineUserIdsForCase` does — buries a senior lawyer on many cases under
   * reminders for hearings they are not attending, and a muted channel then
   * loses the ones that mattered.
   */
  async getLineUserIdsForEvent(event: {
    assigneeId: string | null;
    caseId: string;
  }): Promise<string[]> {
    if (event.assigneeId) return this.toLineUserIds([event.assigneeId]);

    const legalCase = await this.prisma.case.findUnique({
      where: { id: event.caseId },
      select: { leadLawyerId: true },
    });
    return legalCase ? this.toLineUserIds([legalCase.leadLawyerId]) : [];
  }

  private async toLineUserIds(userIds: string[]): Promise<string[]> {
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds }, lineUserId: { not: null } },
      select: { lineUserId: true },
    });
    return users.map((u) => u.lineUserId).filter((id): id is string => Boolean(id));
  }

  /** Everyone staffed on a case — for case-wide news, not per-event reminders. */
  async getLineUserIdsForCase(caseId: string): Promise<string[]> {
    const legalCase = await this.prisma.case.findUnique({
      where: { id: caseId },
      select: {
        leadLawyerId: true,
        assignments: { select: { userId: true } },
      },
    });
    if (!legalCase) return [];

    const userIds = new Set<string>([legalCase.leadLawyerId]);
    for (const assignment of legalCase.assignments) {
      userIds.add(assignment.userId);
    }

    return this.toLineUserIds([...userIds]);
  }

  private async generateLinkCode(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const suffix = randomBytes(3).toString('hex').toUpperCase();
      const code = `LF-${suffix}`;
      const [existingUser, existingContact] = await Promise.all([
        this.prisma.user.findUnique({
          where: { lineLinkCode: code },
          select: { id: true },
        }),
        this.prisma.clientContact.findUnique({
          where: { lineLinkCode: code },
          select: { id: true },
        }),
      ]);
      if (!existingUser && !existingContact) return code;
    }
    throw new ConflictException('Could not generate link code');
  }
}
