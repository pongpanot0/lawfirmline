import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ActivityType,
  AuthUser,
  INSURANCE_CLAIM_STAGE_LABELS,
  InsuranceClaimStage,
} from '@lawfirm/shared';
import { Prisma } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.module';
import { TasksService } from '../tasks/tasks.service';
import { LimitationDeadlineService } from './limitation-deadline.service';
import { getAllowedNextStages, isValidTransition, STAGE_TASK_TEMPLATES } from './stage-automation';
import { CreateInsuranceClaimDto, UpdateInsuranceClaimDto, AdvanceStageDto } from './dto/insurance-claim.dto';

@Injectable()
export class InsuranceClaimsService {
  constructor(
    private prisma: PrismaService,
    private tasksService: TasksService,
    private limitationDeadlineService: LimitationDeadlineService,
  ) {}

  private async withLimitationDeadline<T extends { caseId: string }>(claim: T) {
    const legalCase = await this.prisma.case.findUnique({
      where: { id: claim.caseId },
      select: { limitationDeadline: true },
    });
    return { ...claim, limitationDeadline: legalCase?.limitationDeadline ?? null };
  }

  async findByCase(caseId: string) {
    const claim = await this.prisma.insuranceClaim.findUnique({ where: { caseId } });
    if (!claim) throw new NotFoundException('No insurance claim tracked for this case');
    return this.withLimitationDeadline(claim);
  }

  async create(user: AuthUser, caseId: string, dto: CreateInsuranceClaimDto) {
    const existing = await this.prisma.insuranceClaim.findUnique({ where: { caseId } });
    if (existing) throw new ConflictException('This case already has an insurance claim tracked');

    const incidentDate = new Date(dto.incidentDate);
    const eventId = await this.limitationDeadlineService.applyIncidentDate(caseId, incidentDate);

    try {
      const claim = await this.prisma.insuranceClaim.create({
        data: {
          caseId,
          insurerName: dto.insurerName,
          policyNumber: dto.policyNumber,
          claimNumber: dto.claimNumber,
          incidentDate,
          claimedDate: dto.claimedDate ? new Date(dto.claimedDate) : undefined,
          limitationEventId: eventId,
          createdById: user.id,
        },
      });

      await this.prisma.caseActivity.create({
        data: {
          caseId,
          title: `เริ่มติดตามเคลมประกัน: ${dto.insurerName}`,
          type: ActivityType.DEADLINE,
          createdById: user.id,
        },
      });

      return this.withLimitationDeadline(claim);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('This case already has an insurance claim tracked');
      }
      throw err;
    }
  }

  async update(user: AuthUser, caseId: string, dto: UpdateInsuranceClaimDto) {
    const claim = await this.findByCase(caseId);

    let limitationEventId = claim.limitationEventId;
    let incidentDate = claim.incidentDate;
    if (dto.incidentDate) {
      incidentDate = new Date(dto.incidentDate);
      limitationEventId = await this.limitationDeadlineService.applyIncidentDate(
        caseId,
        incidentDate,
        limitationEventId,
      );
    }

    const updated = await this.prisma.insuranceClaim.update({
      where: { caseId },
      data: {
        insurerName: dto.insurerName,
        policyNumber: dto.policyNumber,
        claimNumber: dto.claimNumber,
        incidentDate,
        claimedDate: dto.claimedDate ? new Date(dto.claimedDate) : undefined,
        denialReason: dto.denialReason,
        demandLetterSentAt: dto.demandLetterSentAt ? new Date(dto.demandLetterSentAt) : undefined,
        demandLetterDeadline: dto.demandLetterDeadline
          ? new Date(dto.demandLetterDeadline)
          : undefined,
        oicComplaintNumber: dto.oicComplaintNumber,
        oicComplaintDate: dto.oicComplaintDate ? new Date(dto.oicComplaintDate) : undefined,
        oicOutcome: dto.oicOutcome,
        limitationEventId,
      },
    });

    await this.prisma.caseActivity.create({
      data: {
        caseId,
        title: `แก้ไขข้อมูลเคลมประกัน: ${updated.insurerName}`,
        type: ActivityType.NOTE,
        createdById: user.id,
      },
    });

    return this.withLimitationDeadline(updated);
  }

  async advanceStage(user: AuthUser, caseId: string, dto: AdvanceStageDto) {
    const claim = await this.findByCase(caseId);

    if (!isValidTransition(claim.stage as InsuranceClaimStage, dto.stage)) {
      throw new BadRequestException(
        `Cannot move from ${claim.stage} to ${dto.stage}. Allowed next stages: ${getAllowedNextStages(claim.stage as InsuranceClaimStage).join(', ')}`,
      );
    }

    const updated = await this.prisma.insuranceClaim.update({
      where: { caseId },
      data: { stage: dto.stage },
    });

    const templates = STAGE_TASK_TEMPLATES[dto.stage] ?? [];
    for (const template of templates) {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + template.dueInDays);
      await this.tasksService.create(user, caseId, {
        title: template.title,
        dueDate: dueDate.toISOString(),
      });
    }

    await this.prisma.caseActivity.create({
      data: {
        caseId,
        title: `เปลี่ยนสถานะเคลมประกันเป็น: ${INSURANCE_CLAIM_STAGE_LABELS[dto.stage]}`,
        type: ActivityType.FILING,
        createdById: user.id,
      },
    });

    return this.withLimitationDeadline(updated);
  }
}
