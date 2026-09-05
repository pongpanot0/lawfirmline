import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PortalIdentity } from './client-portal-jwt.strategy';
import { SubmitPortalIntakeDto } from './dto/portal-intake.dto';

@Injectable()
export class ClientPortalIntakeService {
  constructor(private readonly prisma: PrismaService) {}

  async submit(portalUser: PortalIdentity, dto: SubmitPortalIntakeDto) {
    const count = await this.prisma.portalIntakeSubmission.count();
    const referenceNumber = `REQ-${String(count + 1).padStart(6, '0')}`;

    return this.prisma.portalIntakeSubmission.create({
      data: {
        clientId: portalUser.clientId,
        clientContactId: portalUser.clientContactId,
        referenceNumber,
        title: dto.title,
        detail: dto.detail,
        clientRequestedDate: dto.clientRequestedDate
          ? new Date(dto.clientRequestedDate)
          : undefined,
        urgencyFlag: dto.urgencyFlag ?? false,
      },
    });
  }

  async listMine(portalUser: PortalIdentity) {
    return this.prisma.portalIntakeSubmission.findMany({
      where: { clientContactId: portalUser.clientContactId },
      include: {
        intake: { select: { id: true, status: true, decision: true } },
      },
      orderBy: { submittedAt: 'desc' },
    });
  }
}
