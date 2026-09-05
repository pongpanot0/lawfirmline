import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '@lawfirm/shared';
import { GrantContactCaseAccessDto } from './dto/contact-case-access.dto';

@Injectable()
export class ContactCaseAccessService {
  constructor(private readonly prisma: PrismaService) {}

  private async verifyCase(firmId: string, caseId: string) {
    const legalCase = await this.prisma.case.findFirst({ where: { id: caseId, firmId } });
    if (!legalCase) throw new NotFoundException('ไม่พบคดีนี้');
    return legalCase;
  }

  async grant(user: AuthUser, caseId: string, dto: GrantContactCaseAccessDto) {
    const legalCase = await this.verifyCase(user.firmId, caseId);
    if (!legalCase.clientId) throw new NotFoundException('ไม่พบบุคคลติดต่อนี้');

    const contact = await this.prisma.clientContact.findFirst({
      where: { id: dto.clientContactId, clientId: legalCase.clientId },
    });
    if (!contact) throw new NotFoundException('ไม่พบบุคคลติดต่อนี้');

    return this.prisma.contactCaseAccess.upsert({
      where: {
        clientContactId_caseId: {
          clientContactId: dto.clientContactId,
          caseId,
        },
      },
      create: {
        caseId,
        clientContactId: dto.clientContactId,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        notes: dto.notes,
        grantedById: user.id,
      },
      update: {
        revokedAt: null,
        revokedById: null,
        startDate: new Date(),
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        notes: dto.notes,
        grantedById: user.id,
        grantedAt: new Date(),
      },
    });
  }

  async revoke(user: AuthUser, caseId: string, accessId: string) {
    await this.verifyCase(user.firmId, caseId);

    const access = await this.prisma.contactCaseAccess.findFirst({
      where: { id: accessId, caseId },
    });
    if (!access) throw new NotFoundException('ไม่พบสิทธิ์นี้');

    const now = new Date();
    return this.prisma.contactCaseAccess.update({
      where: { id: accessId },
      data: { revokedAt: now, revokedById: user.id, endDate: now },
    });
  }

  async listForCase(user: AuthUser, caseId: string) {
    await this.verifyCase(user.firmId, caseId);

    return this.prisma.contactCaseAccess.findMany({
      where: { caseId },
      include: { clientContact: { select: { name: true, email: true } } },
      orderBy: { grantedAt: 'desc' },
    });
  }
}
