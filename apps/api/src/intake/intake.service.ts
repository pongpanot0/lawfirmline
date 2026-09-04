import { Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import {
  CreateIntakeDto,
  UpdateIntakeDto,
  AssessIntakeDto,
  DecideIntakeDto,
  NoticeDto,
  ConvertToCaseDto,
  IntakeQueryDto,
  IntakeDecision,
} from './dto/intake.dto';

@Injectable()
export class IntakeService {
  constructor(private prisma: PrismaService) {}

  private intakeInclude = {
    receivedBy: {
      select: { id: true, firstName: true, lastName: true, email: true },
    },
    assessor: {
      select: { id: true, firstName: true, lastName: true, email: true },
    },
    client: { select: { id: true, name: true } },
    case: { select: { id: true, ownRef: true, title: true, status: true } },
  };

  async findAll(user: AuthUser, query: IntakeQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { firmId: user.firmId };
    if (query.status) {
      where.status = query.status;
    }
    if (query.search) {
      const term = query.search.trim();
      where.OR = [
        { title: { contains: term, mode: 'insensitive' } },
        { clientName: { contains: term, mode: 'insensitive' } },
        { referralName: { contains: term, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.intake.findMany({
        where,
        include: this.intakeInclude,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.intake.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async findOne(user: AuthUser, id: string) {
    const intake = await this.prisma.intake.findFirst({
      where: { id, firmId: user.firmId },
      include: this.intakeInclude,
    });
    if (!intake) throw new NotFoundException('Intake not found');
    return intake;
  }

  async create(user: AuthUser, dto: CreateIntakeDto) {
    return this.prisma.intake.create({
      data: {
        firmId: user.firmId,
        receivedById: user.id,
        receivedDate: new Date(dto.receivedDate),
        title: dto.title,
        referralType: dto.referralType as string | undefined as any,
        referralChannel: dto.referralChannel as string | undefined as any,
        referralName: dto.referralName,
        clientId: dto.clientId,
        clientName: dto.clientName,
        matterType: dto.matterType,
        opposingParty: dto.opposingParty,
        incidentDate: dto.incidentDate ? new Date(dto.incidentDate) : undefined,
        description: dto.description,
        estimatedDamage: dto.estimatedDamage,
      },
      include: this.intakeInclude,
    });
  }

  async update(user: AuthUser, id: string, dto: UpdateIntakeDto) {
    await this.findOne(user, id);
    return this.prisma.intake.update({
      where: { id },
      data: {
        receivedDate: dto.receivedDate ? new Date(dto.receivedDate) : undefined,
        title: dto.title,
        referralType: dto.referralType as any,
        referralChannel: dto.referralChannel as any,
        referralName: dto.referralName,
        clientId: dto.clientId,
        clientName: dto.clientName,
        matterType: dto.matterType,
        opposingParty: dto.opposingParty,
        incidentDate: dto.incidentDate ? new Date(dto.incidentDate) : undefined,
        description: dto.description,
        estimatedDamage: dto.estimatedDamage,
        assessmentNotes: dto.assessmentNotes,
        caseStrength: dto.caseStrength,
        decision: dto.decision as any,
        decisionNotes: dto.decisionNotes,
        clientDecision: dto.clientDecision,
        noticeRecipient: dto.noticeRecipient,
        noticeDeadline: dto.noticeDeadline ? new Date(dto.noticeDeadline) : undefined,
        noticeResult: dto.noticeResult,
      },
      include: this.intakeInclude,
    });
  }

  async assess(user: AuthUser, id: string, dto: AssessIntakeDto) {
    await this.findOne(user, id);
    return this.prisma.intake.update({
      where: { id },
      data: {
        assessorId: dto.assessorId ?? user.id,
        assessedAt: new Date(),
        status: 'ASSESSING' as any,
        assessmentNotes: dto.assessmentNotes,
        caseStrength: dto.caseStrength,
      },
      include: this.intakeInclude,
    });
  }

  async decide(user: AuthUser, id: string, dto: DecideIntakeDto) {
    await this.findOne(user, id);

    const acceptedDecisions: IntakeDecision[] = [
      IntakeDecision.FILE_SUIT,
      IntakeDecision.NEGOTIATE_FIRST,
      IntakeDecision.SEND_NOTICE,
      IntakeDecision.COMPLAIN_TO_AUTHORITY,
    ];
    const status = acceptedDecisions.includes(dto.decision) ? 'ACCEPTED' : 'REJECTED';

    return this.prisma.intake.update({
      where: { id },
      data: {
        decidedAt: new Date(),
        status: status as any,
        decision: dto.decision as any,
        decisionNotes: dto.decisionNotes,
        clientDecision: dto.clientDecision,
      },
      include: this.intakeInclude,
    });
  }

  async issueNotice(user: AuthUser, id: string, dto: NoticeDto) {
    await this.findOne(user, id);
    return this.prisma.intake.update({
      where: { id },
      data: {
        noticeIssuedAt: new Date(),
        noticeRecipient: dto.noticeRecipient,
        noticeDeadline: dto.noticeDeadline ? new Date(dto.noticeDeadline) : undefined,
        noticeResult: dto.noticeResult,
      },
      include: this.intakeInclude,
    });
  }

  async convertToCase(user: AuthUser, id: string, dto: ConvertToCaseDto) {
    const intake = await this.findOne(user, id);

    // Generate ownRef like cases.service.ts
    const firm = await this.prisma.firm.findUnique({
      where: { id: user.firmId },
      select: { ownRefPrefix: true },
    });
    const prefix = (firm?.ownRefPrefix || 'TSBREF').toUpperCase();
    const year = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
    }).format(new Date());
    const yearKey = `${prefix}${year}`;

    const existing = await this.prisma.case.findMany({
      where: { firmId: user.firmId, ownRef: { startsWith: yearKey } },
      select: { ownRef: true },
    });

    const pattern = new RegExp(
      `^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}${year}(\\d+)$`,
    );
    let maxSeq = 0;
    for (const row of existing) {
      const match = row.ownRef.match(pattern);
      if (!match) continue;
      const seq = parseInt(match[1], 10);
      if (!Number.isNaN(seq) && seq > maxSeq) maxSeq = seq;
    }
    const ownRef = `${prefix}${year}${String(maxSeq + 1).padStart(4, '0')}`;

    const folderId = `LF-${new Date().getFullYear()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    const title =
      dto.title ||
      intake.title ||
      (intake.clientName && intake.matterType
        ? `${intake.clientName} - ${intake.matterType}`
        : intake.clientName || 'คดีจาก Intake');

    const newCase = await this.prisma.case.create({
      data: {
        firmId: user.firmId,
        ownRef,
        folderId,
        title,
        description: intake.description ?? undefined,
        clientId: intake.clientId ?? undefined,
        clientName: intake.clientName ?? undefined,
        referralSource: intake.referralName ?? undefined,
        status: 'OPEN' as any,
        leadLawyerId: dto.leadLawyerId ?? user.id,
        intakeId: intake.id,
      },
    });

    await this.prisma.intake.update({
      where: { id },
      data: { status: 'CONVERTED' as any },
    });

    return newCase;
  }
}
