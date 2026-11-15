import { BadRequestException, Body, Controller, ForbiddenException, Get, NotFoundException, Patch, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { randomUUID } from 'crypto';
import { Response } from 'express';
import { AuthUser, hasFirmCapability } from '@lawfirm/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { FileStorageService } from '../common/services/file-storage.service';
import { PrismaService } from '../prisma/prisma.module';
import { BillingProfileDto } from '../billing/dto/billing.dto';
import { SkipSubscription } from './decorators/saas.decorators';

const profileSelect = { legalName: true, taxId: true, taxBranch: true, billingAddress: true, vatRegistered: true, logoKey: true } as const;

@Controller('firm/billing-profile')
@UseGuards(JwtAuthGuard)
@SkipSubscription()
export class FirmBillingProfileController {
  constructor(private prisma: PrismaService, private storage: FileStorageService) {}

  private owner(user: AuthUser) {
    if (!hasFirmCapability(user.firmRole, 'manageSubscription')) throw new ForbiddenException('ให้เจ้าของสำนักงานแก้ไขข้อมูลออกบิล');
  }

  @Get()
  async get(@CurrentUser() user: AuthUser) {
    const firm = await this.prisma.firm.findUnique({ where: { id: user.firmId }, select: profileSelect });
    if (!firm) throw new NotFoundException('ไม่พบสำนักงาน');
    return firm;
  }

  @Patch()
  async update(@CurrentUser() user: AuthUser, @Body() dto: BillingProfileDto) {
    this.owner(user);
    // Lock before merging partial fields so concurrent edits cannot leave an incomplete VAT profile.
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "Firm" WHERE "id" = ${user.firmId} FOR UPDATE`;
      const firm = await tx.firm.findUnique({ where: { id: user.firmId }, select: profileSelect });
      if (!firm) throw new NotFoundException('ไม่พบสำนักงาน');
      const data = { legalName: dto.legalName, taxId: dto.taxId, taxBranch: dto.taxBranch,
        billingAddress: dto.billingAddress, vatRegistered: dto.vatRegistered };
      const next = { ...firm, ...Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)) };
      if (next.taxId && !/^\d{13}$/.test(next.taxId)) throw new BadRequestException('ระบุเลขประจำตัวผู้เสียภาษี 13 หลัก');
      if (next.vatRegistered && (!next.taxId || !next.legalName?.trim() || !next.billingAddress?.trim())) {
        throw new BadRequestException('กรอกเลขผู้เสียภาษี ชื่อจดทะเบียน และที่อยู่ก่อนเปิด VAT');
      }
      return tx.firm.update({ where: { id: user.firmId }, data, select: profileSelect });
    });
  }

  @Post('logo')
  @UseInterceptors(FileInterceptor('logo', { limits: { fileSize: 1024 * 1024 } }))
  async uploadLogo(@CurrentUser() user: AuthUser, @UploadedFile() file?: Express.Multer.File) {
    this.owner(user);
    const buffer = file?.buffer;
    if (!file || !buffer?.length || buffer.length > 1024 * 1024) throw new BadRequestException('เลือกไฟล์ PNG, JPG หรือ SVG ขนาดไม่เกิน 1 MB');
    const png = file.mimetype === 'image/png' && buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'));
    const jpg = file.mimetype === 'image/jpeg' && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    const svgText = buffer.toString('utf8');
    const svg = file.mimetype === 'image/svg+xml' && /^(?:\s*<\?xml[^>]*\?>)?\s*<svg[\s>]/i.test(svgText)
      && !/<!|<(?:script|foreignObject|iframe|object|embed|a|animate|set)\b|\son\w+\s*=|(?:href|src)\s*=|url\s*\(|@import|javascript:|data:/i.test(svgText);
    if (!png && !jpg && !svg) throw new BadRequestException('เลือกภาพ PNG, JPG หรือ SVG ที่ไม่มีสคริปต์หรือลิงก์ภายนอก');
    await this.get(user);
    const extension = png ? 'png' : jpg ? 'jpg' : 'svg';
    const key = await this.storage.put(`firms/${user.firmId}/billing/logos/${randomUUID()}.${extension}`, buffer, file.mimetype, { firmId: user.firmId });
    try {
      await this.prisma.firm.update({ where: { id: user.firmId }, data: { logoKey: key } });
    } catch (error) {
      await this.storage.delete(key).catch(() => undefined);
      throw error;
    }
    // Old logo objects remain available to frozen receipt snapshots.
    return { logoKey: key };
  }

  @Get('logo')
  async logo(@CurrentUser() user: AuthUser, @Res() res: Response, @Query('key') key?: string) {
    if (!hasFirmCapability(user.firmRole, 'manageInvoices') && !hasFirmCapability(user.firmRole, 'manageSubscription')) throw new ForbiddenException('ไม่มีสิทธิ์ดูโลโก้เอกสาร');
    const firm = await this.get(user);
    const logoKey = key ?? firm.logoKey;
    const prefix = `firms/${user.firmId}/billing/logos/`;
    if (!logoKey?.startsWith(prefix) || !/^[a-f0-9-]{36}\.(png|jpg|svg)$/.test(logoKey.slice(prefix.length))) throw new NotFoundException('ไม่พบโลโก้');
    const stream = await this.storage.openDownloadStream(logoKey);
    res.setHeader('Content-Type', logoKey.endsWith('.svg') ? 'image/svg+xml' : logoKey.endsWith('.png') ? 'image/png' : 'image/jpeg');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  }
}
