import { Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { CreateParticipantDto, UpdateParticipantDto } from './dto/case.dto';

@Injectable()
export class CaseParticipantsService {
  constructor(private prisma: PrismaService) {}

  private async verifyCase(firmId: string, caseId: string) {
    const legalCase = await this.prisma.case.findFirst({
      where: { id: caseId, firmId },
    });
    if (!legalCase) throw new NotFoundException('Case not found');
    return legalCase;
  }

  async findAll(user: AuthUser, caseId: string) {
    await this.verifyCase(user.firmId, caseId);
    return this.prisma.caseParticipant.findMany({
      where: { caseId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(user: AuthUser, caseId: string, dto: CreateParticipantDto) {
    await this.verifyCase(user.firmId, caseId);
    return this.prisma.caseParticipant.create({
      data: { caseId, ...dto },
    });
  }

  async update(user: AuthUser, caseId: string, participantId: string, dto: UpdateParticipantDto) {
    await this.verifyCase(user.firmId, caseId);
    const participant = await this.prisma.caseParticipant.findFirst({
      where: { id: participantId, caseId },
    });
    if (!participant) throw new NotFoundException('Participant not found');
    return this.prisma.caseParticipant.update({
      where: { id: participantId },
      data: dto,
    });
  }

  async remove(user: AuthUser, caseId: string, participantId: string) {
    await this.verifyCase(user.firmId, caseId);
    const participant = await this.prisma.caseParticipant.findFirst({
      where: { id: participantId, caseId },
    });
    if (!participant) throw new NotFoundException('Participant not found');
    await this.prisma.caseParticipant.delete({ where: { id: participantId } });
    return { deleted: true };
  }
}
