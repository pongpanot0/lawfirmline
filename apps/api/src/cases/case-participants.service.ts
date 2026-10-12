import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ActivityType, AuthUser } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { CaseFeedService } from '../common/services/case-feed.service';
import { assertFirmRefs } from '../common/firm-refs';
import { CreateParticipantDto, UpdateParticipantDto } from './dto/case.dto';

const ROLE_TH: Record<string, string> = {
  PLAINTIFF: 'โจทก์', JOINT_PLAINTIFF: 'โจทก์ร่วม', DEFENDANT: 'จำเลย', JOINT_DEFENDANT: 'จำเลยร่วม',
  PETITIONER: 'ผู้ร้อง', RESPONDENT: 'ผู้คัดค้าน', WITNESS: 'พยาน', EXPERT: 'ผู้เชี่ยวชาญ',
  OPPOSING_LAWYER: 'ทนายฝ่ายตรงข้าม', OPPOSING_INSURER: 'บริษัทประกันฝ่ายตรงข้าม', OTHER: 'อื่น ๆ',
};

@Injectable()
export class CaseParticipantsService {
  constructor(
    private prisma: PrismaService,
    private caseFeed: CaseFeedService,
  ) {}

  private async verifyCase(firmId: string, caseId: string) {
    const legalCase = await this.prisma.case.findFirst({ where: { id: caseId, firmId } });
    if (!legalCase) throw new NotFoundException('Case not found');
    return legalCase;
  }

  /** A linked client must be this firm's; represented party must be on this case and not the row itself. */
  private async checkLinks(
    user: AuthUser,
    caseId: string,
    dto: { clientId?: string | null; representedByParticipantId?: string | null },
    selfId?: string,
  ) {
    await assertFirmRefs(this.prisma, user.firmId, { clientIds: [dto.clientId] });
    if (dto.representedByParticipantId) {
      const party = dto.representedByParticipantId === selfId
        ? null
        : await this.prisma.caseParticipant.findFirst({ where: { id: dto.representedByParticipantId, caseId } });
      if (!party) throw new BadRequestException('คู่ความที่เลือกไม่อยู่ในคดีนี้');
    }
  }

  private async record(
    user: AuthUser,
    caseId: string,
    action: 'ADDED' | 'UPDATED' | 'REMOVED',
    row: { id: string; name: string; role: string; side: string },
  ) {
    const verb = { ADDED: 'เพิ่มคู่ความ', UPDATED: 'แก้ไขคู่ความ', REMOVED: 'ลบคู่ความ' }[action];
    await this.caseFeed.log({
      caseId,
      userId: user.id,
      type: ActivityType.NOTE,
      title: `${verb}: ${row.name} (${ROLE_TH[row.role] ?? row.role})`,
    });
    await this.prisma.auditLog.create({
      data: {
        firmId: user.firmId,
        userId: user.id,
        action: `CASE_PARTICIPANT_${action}`,
        metadata: { caseId, participantId: row.id, name: row.name, role: row.role, side: row.side },
      },
    });
  }

  async findAll(user: AuthUser, caseId: string) {
    await this.verifyCase(user.firmId, caseId);
    return this.prisma.caseParticipant.findMany({ where: { caseId }, orderBy: { createdAt: 'asc' } });
  }

  async create(user: AuthUser, caseId: string, dto: CreateParticipantDto) {
    await this.verifyCase(user.firmId, caseId);
    await this.checkLinks(user, caseId, dto);
    const created = await this.prisma.caseParticipant.create({ data: { caseId, ...dto } });
    await this.record(user, caseId, 'ADDED', created);
    return created;
  }

  async update(user: AuthUser, caseId: string, participantId: string, dto: UpdateParticipantDto) {
    await this.verifyCase(user.firmId, caseId);
    const participant = await this.prisma.caseParticipant.findFirst({ where: { id: participantId, caseId } });
    if (!participant) throw new NotFoundException('Participant not found');
    await this.checkLinks(user, caseId, dto, participantId);
    const updated = await this.prisma.caseParticipant.update({ where: { id: participantId }, data: dto });
    await this.record(user, caseId, 'UPDATED', updated);
    return updated;
  }

  async remove(user: AuthUser, caseId: string, participantId: string) {
    await this.verifyCase(user.firmId, caseId);
    const participant = await this.prisma.caseParticipant.findFirst({ where: { id: participantId, caseId } });
    if (!participant) throw new NotFoundException('Participant not found');
    await this.prisma.caseParticipant.delete({ where: { id: participantId } });
    await this.record(user, caseId, 'REMOVED', participant);
    return { deleted: true };
  }
}
