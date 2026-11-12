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

    const linked = await this.prisma.user.findUnique({
      where: { lineUserId },
      select: { id: true },
    });

    if (!this.limiter.recordAttempt(lineUserId)) {
      return '❌ พยายามเชื่อมต่อบ่อยเกินไป กรุณาลองใหม่ภายหลัง';
    }

    const user = await this.prisma.user.findUnique({
      where: { lineLinkCode: trimmed },
    });

    const GENERIC_FAILURE_MESSAGE =
      '❌ รหัสไม่ถูกต้องหรือหมดอายุ กรุณากด "เชื่อมต่อ LINE" ในหน้าตั้งค่าเพื่อสร้างรหัสใหม่ แล้วส่งมาอีกครั้ง';

    // Unknown code from an unlinked LINE account may be a client-portal code:
    // let contact linking try it. A linked account gets the answer here.
    if (!user) {
      return linked ? GENERIC_FAILURE_MESSAGE : null;
    }

    if (
      !user.lineLinkCodeExpiresAt ||
      user.lineLinkCodeExpiresAt.getTime() < Date.now()
    ) {
      return GENERIC_FAILURE_MESSAGE;
    }

    // A fresh code proves the sender can sign in as `user`, so this LINE account
    // moves to them. Without this, a LINE account left on a stale user (removed
    // from the firm, external) could never be re-linked.
    await this.prisma.$transaction([
      ...(linked && linked.id !== user.id
        ? [this.prisma.user.update({ where: { id: linked.id }, data: { lineUserId: null, lineConnectedAt: null } })]
        : []),
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          lineUserId,
          lineConnectedAt: new Date(),
          lineLinkCode: null,
          lineLinkCodeExpiresAt: null,
        },
      }),
    ]);

    this.limiter.reset(lineUserId);
    if (linked && linked.id !== user.id) {
      this.logger.log(`Moved LINE user ${lineUserId} from LexFlow user ${linked.id} to ${user.id}`);
    }
    this.logger.log(`Linked LINE user ${lineUserId} to LexFlow user ${user.id}`);
    return `✅ เชื่อมต่อสำเร็จ!\nสวัสดีคุณ ${user.firstName} คุณจะได้รับแจ้งเตือนนัดหมายล่วงหน้า 3 วันก่อนถึงวันนัด`;
  }

  /** Everyone staffed on a case — for case-wide news, not per-event reminders. */
  async getCaseTeamUserIds(caseId: string): Promise<string[]> {
    const legalCase = await this.prisma.case.findUnique({
      where: { id: caseId },
      select: {
        leadLawyerId: true,
        assignments: { select: { userId: true } },
      },
    });
    if (!legalCase) return [];
    return [...new Set([legalCase.leadLawyerId, ...legalCase.assignments.map((a) => a.userId)])];
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
