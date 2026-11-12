import { BadRequestException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { AuthUser, hasFirmCapability } from '@lawfirm/shared';
import { redirectUriMatches } from '@modelcontextprotocol/sdk/server/auth/handlers/authorize.js';
import { Prisma } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.module';
import { McpOAuthProvider } from './mcp-oauth.provider';
import { McpConsentDto } from './mcp.dto';
import { randomToken, tokenHash } from './mcp-config';

const summarySelect = { id: true, clientName: true, createdAt: true, lastUsedAt: true } as const;

@Injectable()
export class McpService {
  constructor(private readonly prisma: PrismaService, private readonly provider: McpOAuthProvider) {}

  private async validateConsent(dto: McpConsentDto, tx: Prisma.TransactionClient = this.prisma) {
    const client = await tx.mcpClient.findUnique({ where: { clientId: dto.client_id } });
    if (!client || !client.redirectUris.some(uri => redirectUriMatches(dto.redirect_uri, uri))) throw new BadRequestException('ไม่พบแอปหรือที่อยู่กลับ กรุณาเริ่มเชื่อมต่อใหม่');
    if (dto.code_challenge_method !== 'S256' || !/^[A-Za-z0-9_-]{43}$/.test(dto.code_challenge)) throw new BadRequestException('ข้อมูลการเชื่อมต่อไม่ถูกต้อง กรุณาเริ่มใหม่');
    try {
      this.provider.validateResource(dto.resource ? new URL(dto.resource) : undefined);
      this.provider.validateScopes(dto.scope?.split(' '));
    } catch { throw new BadRequestException('ข้อมูลการเชื่อมต่อไม่ถูกต้อง กรุณาเริ่มใหม่'); }
    return client;
  }

  async consentInfo(user: AuthUser, dto: McpConsentDto) {
    const client = await this.validateConsent(dto);
    const firm = await this.prisma.firm.findUniqueOrThrow({ where: { id: user.firmId }, select: { mcpEnabled: true } });
    return { clientName: client.clientName, redirectHost: new URL(dto.redirect_uri).host, firmEnabled: firm.mcpEnabled,
      user: { firstName: user.firstName, lastName: user.lastName, email: user.email, firmName: user.firmName } };
  }

  private redirect(dto: McpConsentDto, key: 'code' | 'error', value: string) {
    const url = new URL(dto.redirect_uri);
    for (const param of ['code', 'error', 'error_description', 'state', 'iss']) url.searchParams.delete(param);
    url.searchParams.set(key, value);
    if (dto.state !== undefined) url.searchParams.set('state', dto.state);
    url.searchParams.set('iss', this.provider.issuerUrl.href);
    return { redirectUrl: url.href };
  }

  async approve(user: AuthUser, dto: McpConsentDto, sessionJti: string) {
    if (!sessionJti) throw new UnauthorizedException('กรุณาเข้าสู่ระบบอีกครั้งก่อนเชื่อมต่อ AI');
    return this.prisma.$transaction(async tx => {
      const client = await this.validateConsent(dto, tx);
      const now = new Date();
      // These writes serialize consent with session revocation, firm shutdown and member removal.
      const session = await tx.session.updateMany({ where: { jti: sessionJti, userId: user.id, revokedAt: null, expiresAt: { gt: now } }, data: { lastUsedAt: now } });
      if (!session.count) throw new UnauthorizedException('กรุณาเข้าสู่ระบบอีกครั้งก่อนเชื่อมต่อ AI');
      const firm = await tx.firm.updateMany({ where: { id: user.firmId, mcpEnabled: true }, data: { mcpEnabled: true } });
      if (!firm.count) throw new ForbiddenException('สำนักงานยังไม่เปิดใช้ AI กรุณาติดต่อเจ้าของสำนักงาน');
      const member = await tx.firmMember.updateMany({ where: { firmId: user.firmId, userId: user.id, role: { not: 'EXTERNAL' } }, data: { userId: user.id } });
      if (!member.count) throw new ForbiddenException('คุณไม่ได้เป็นสมาชิกสำนักงานนี้แล้ว');
      const connection = await tx.mcpConnection.create({ data: { firmId: user.firmId, userId: user.id, clientId: client.clientId, clientName: client.clientName } });
      const code = randomToken();
      await tx.mcpAuthCode.create({ data: { codeHash: tokenHash(code), connectionId: connection.id, clientId: client.clientId, redirectUri: dto.redirect_uri,
        codeChallenge: dto.code_challenge, resource: dto.resource, expiresAt: new Date(Date.now() + 10 * 60 * 1000) } });
      await tx.auditLog.create({ data: { firmId: user.firmId, userId: user.id, action: 'mcp.connect', metadata: { connectionId: connection.id, clientName: client.clientName } } });
      return this.redirect(dto, 'code', code);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async deny(_user: AuthUser, dto: McpConsentDto) {
    await this.validateConsent(dto);
    return this.redirect(dto, 'error', 'access_denied');
  }

  async mine(user: AuthUser) {
    const [firm, connections] = await Promise.all([
      this.prisma.firm.findUniqueOrThrow({ where: { id: user.firmId }, select: { mcpEnabled: true } }),
      this.prisma.mcpConnection.findMany({ where: { firmId: user.firmId, userId: user.id, revokedAt: null }, select: summarySelect, orderBy: { createdAt: 'desc' } }),
    ]);
    return { enabled: firm.mcpEnabled, mcpUrl: this.provider.resourceUrl.href, connections };
  }

  private owner(user: AuthUser) {
    if (!hasFirmCapability(user.firmRole, 'manageAiConnections')) throw new ForbiddenException('เฉพาะเจ้าของสำนักงานที่จัดการการเชื่อมต่อ AI ได้');
  }

  async settings(user: AuthUser) {
    this.owner(user);
    const firm = await this.prisma.firm.findUniqueOrThrow({ where: { id: user.firmId }, select: { mcpEnabled: true } });
    return { enabled: firm.mcpEnabled };
  }

  async updateSettings(user: AuthUser, enabled: boolean) {
    this.owner(user);
    await this.prisma.$transaction(async tx => {
      await tx.firm.update({ where: { id: user.firmId }, data: { mcpEnabled: enabled } });
      if (!enabled) await tx.mcpConnection.updateMany({ where: { firmId: user.firmId, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.auditLog.create({ data: { firmId: user.firmId, userId: user.id, action: 'mcp.settings', metadata: { enabled } } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return { enabled };
  }

  list(user: AuthUser) {
    this.owner(user);
    return this.prisma.mcpConnection.findMany({ where: { firmId: user.firmId, revokedAt: null },
      select: { ...summarySelect, user: { select: { id: true, firstName: true, lastName: true, email: true } } }, orderBy: { createdAt: 'desc' } });
  }

  async disconnect(user: AuthUser, id: string, own: boolean) {
    if (!own) this.owner(user);
    await this.prisma.$transaction(async tx => {
      const connection = await tx.mcpConnection.findFirst({ where: { id, firmId: user.firmId, ...(own ? { userId: user.id } : {}), revokedAt: null } });
      if (!connection) throw new NotFoundException('ไม่พบการเชื่อมต่อนี้');
      await tx.mcpConnection.updateMany({ where: { id: connection.id, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.auditLog.create({ data: { firmId: user.firmId, userId: user.id, action: 'mcp.disconnect', metadata: { connectionId: connection.id, clientName: connection.clientName } } });
    });
  }
}
