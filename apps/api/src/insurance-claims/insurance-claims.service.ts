import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ActivityType, AuthUser, InsuranceClaimStage } from '@lawfirm/shared';
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

  async findByCase(caseId: string) {
    const claim = await this.prisma.insuranceClaim.findUnique({ where: { caseId } });
    if (!claim) throw new NotFoundException('No insurance claim tracked for this case');
    return claim;
  }

  async create(user: AuthUser, caseId: string, dto: CreateInsuranceClaimDto) {
    const existing = await this.prisma.insuranceClaim.findUnique({ where: { caseId } });
    if (existing) throw new ConflictException('This case already has an insurance claim tracked');

    const incidentDate = new Date(dto.incidentDate);
    const eventId = await this.limitationDeadlineService.applyIncidentDate(caseId, incidentDate);

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

    return claim;
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

    return this.prisma.insuranceClaim.update({
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
  }

  async advanceStage(user: AuthUser, caseId: string, dto: AdvanceStageDto) {
    const claim = await this.findByCase(caseId);

    if (!isValidTransition(claim.stage as InsuranceClaimStage, dto.stage)) {
      throw new ConflictException(
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
        title: `เปลี่ยนสถานะเคลมประกันเป็น: ${dto.stage}`,
        type: ActivityType.FILING,
        createdById: user.id,
      },
    });

    return updated;
  }
}
