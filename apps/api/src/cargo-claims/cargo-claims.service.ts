import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser, CARGO_DOCUMENT_REQUIREMENTS, FirmRole } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { CaseAccessService } from '../common/services/case-access.service';
import { UpdateCargoRequirementDto, UpsertCargoClaimDto } from './dto/cargo-claim.dto';

@Injectable()
export class CargoClaimsService {
  private readonly include = {
    requirements: {
      orderBy: { createdAt: 'asc' as const },
      include: { document: { select: { id: true, filename: true, caseId: true, intakeId: true } } },
    },
    confirmedBy: { select: { id: true, firstName: true, lastName: true } },
  };

  constructor(
    private prisma: PrismaService,
    private caseAccess: CaseAccessService,
  ) {}

  private values(dto: UpsertCargoClaimDto = {}) {
    const date = (value: string | null | undefined) =>
      value === null ? null : value ? new Date(value) : undefined;
    return {
      assuredName: dto.assuredName,
      shipperName: dto.shipperName,
      consigneeName: dto.consigneeName,
      contractingCarrierName: dto.contractingCarrierName,
      actualCarrierName: dto.actualCarrierName,
      origin: dto.origin,
      destination: dto.destination,
      transportMode: dto.transportMode,
      transportDocumentNumber: dto.transportDocumentNumber,
      arrivalDate: date(dto.arrivalDate),
      lossDate: date(dto.lossDate),
      goodsDescription: dto.goodsDescription,
      movementTerm: dto.movementTerm,
      damageDescription: dto.damageDescription,
      damagedWeight: dto.damagedWeight,
      weightUnit: dto.weightUnit,
      claimAmount: dto.claimAmount,
      currency: dto.currency?.trim().toUpperCase(),
      applicableLaw: dto.applicableLaw,
      jurisdiction: dto.jurisdiction,
      liableParty: dto.liableParty,
      liabilityLimit: dto.liabilityLimit,
      liabilityExclusion: dto.liabilityExclusion,
      timeBarPeriod: dto.timeBarPeriod,
      timeBarTriggerDate: date(dto.timeBarTriggerDate),
      timeBarDeadline: date(dto.timeBarDeadline),
      timeBarBasis: dto.timeBarBasis,
      quantumNotes: dto.quantumNotes,
      recommendation: dto.recommendation,
      opinion: dto.opinion,
    };
  }

  private requirementRows() {
    return CARGO_DOCUMENT_REQUIREMENTS.map((item) => ({
      code: item.code,
      label: item.label,
      required: item.requiredByDefault,
    }));
  }

  private async visibleIntake(user: AuthUser, intakeId: string) {
    const intake = await this.prisma.intake.findFirst({
      where: { id: intakeId, ...(await this.caseAccess.getIntakeFilterForUser(user)) },
      include: { cargoClaim: { include: this.include } },
    });
    if (!intake) throw new NotFoundException('Intake not found');
    return intake;
  }

  private async assertCase(user: AuthUser, caseId: string) {
    if (!(await this.caseAccess.canAccessCase(user, caseId))) {
      throw new ForbiddenException('You do not have access to this case');
    }
  }

  async ensureForIntake(user: AuthUser, intakeId: string, dto: UpsertCargoClaimDto = {}) {
    const intake = await this.visibleIntake(user, intakeId);
    if (intake.cargoClaim) return intake.cargoClaim;
    return this.prisma.cargoClaim.create({
      data: {
        firmId: user.firmId,
        intakeId,
        ...this.values(dto),
        requirements: { create: this.requirementRows() },
      },
      include: this.include,
    });
  }

  async ensureForCase(user: AuthUser, caseId: string, dto: UpsertCargoClaimDto = {}) {
    await this.assertCase(user, caseId);
    const existing = await this.prisma.cargoClaim.findUnique({ where: { caseId }, include: this.include });
    if (existing) return existing;
    return this.prisma.cargoClaim.create({
      data: {
        firmId: user.firmId,
        caseId,
        ...this.values(dto),
        requirements: { create: this.requirementRows() },
      },
      include: this.include,
    });
  }

  async attachCase(user: AuthUser, intakeId: string, caseId: string) {
    await this.assertCase(user, caseId);
    const cargo = await this.ensureForIntake(user, intakeId);
    if (cargo.caseId && cargo.caseId !== caseId) {
      throw new BadRequestException('Cargo claim is already attached to another case');
    }
    if (cargo.caseId === caseId) return cargo;
    return this.prisma.cargoClaim.update({
      where: { id: cargo.id },
      data: { caseId },
      include: this.include,
    });
  }

  async findForIntake(user: AuthUser, intakeId: string) {
    const intake = await this.visibleIntake(user, intakeId);
    return intake.cargoClaim;
  }

  async findForCase(user: AuthUser, caseId: string) {
    await this.assertCase(user, caseId);
    return this.prisma.cargoClaim.findUnique({ where: { caseId }, include: this.include });
  }

  private reviewData(user: AuthUser, dto: UpsertCargoClaimDto) {
    if (dto.confirm || dto.reviewStatus === 'CONFIRMED') {
      if (![FirmRole.OWNER, FirmRole.SENIOR_LAWYER, FirmRole.LAWYER].includes(user.firmRole as FirmRole)) {
        throw new ForbiddenException('Only a lawyer may confirm cargo analysis');
      }
      return { reviewStatus: 'CONFIRMED' as const, confirmedById: user.id, confirmedAt: new Date() };
    }
    return { reviewStatus: 'DRAFT' as const, confirmedById: null, confirmedAt: null };
  }

  async updateForIntake(user: AuthUser, intakeId: string, dto: UpsertCargoClaimDto) {
    const cargo = await this.ensureForIntake(user, intakeId);
    return this.prisma.cargoClaim.update({
      where: { id: cargo.id },
      data: { ...this.values(dto), ...this.reviewData(user, dto) },
      include: this.include,
    });
  }

  async updateForCase(user: AuthUser, caseId: string, dto: UpsertCargoClaimDto) {
    const cargo = await this.ensureForCase(user, caseId);
    return this.prisma.cargoClaim.update({
      where: { id: cargo.id },
      data: { ...this.values(dto), ...this.reviewData(user, dto) },
      include: this.include,
    });
  }

  async updateRequirement(
    user: AuthUser,
    context: { intakeId?: string; caseId?: string },
    requirementId: string,
    dto: UpdateCargoRequirementDto,
  ) {
    const cargo = context.caseId
      ? await this.findForCase(user, context.caseId)
      : await this.findForIntake(user, context.intakeId!);
    if (!cargo) throw new NotFoundException('Cargo claim not found');
    const requirement = cargo.requirements.find((item) => item.id === requirementId);
    if (!requirement) throw new NotFoundException('Cargo document requirement not found');
    if (dto.documentId) {
      const document = await this.prisma.document.findFirst({
        where: {
          id: dto.documentId,
          OR: [
            ...(cargo.caseId ? [{ caseId: cargo.caseId }] : []),
            ...(cargo.intakeId ? [{ intakeId: cargo.intakeId }] : []),
          ],
        },
      });
      if (!document) throw new BadRequestException('Document does not belong to this cargo claim');
    }
    return this.prisma.cargoDocumentRequirement.update({
      where: { id: requirementId },
      data: {
        required: dto.required,
        status: dto.status,
        note: dto.note,
        documentId: dto.documentId,
      },
      include: { document: { select: { id: true, filename: true, caseId: true, intakeId: true } } },
    });
  }
}
