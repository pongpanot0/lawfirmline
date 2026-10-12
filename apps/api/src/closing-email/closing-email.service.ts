import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { ClosingEmailDraftStatus } from '../generated/prisma';
import { EmailService } from '../notifications/email.service';
import {
  ApproveClosingEmailDraftDto,
  CreateClosingEmailDraftDto,
  UpdateClosingEmailDraftDto,
} from './dto/closing-email.dto';

export interface CaseActivitySummary {
  id: string;
  title: string;
  description: string | null;
  activityAt: Date;
}

export interface ClosingEmailCaseData {
  caseId: string;
  clientId?: string | null;
  ownRef: string;
  customerRef: string | null;
  clientName: string | null;
  title: string;
  courtName: string | null;
  closingSummary: string | null;
  closedAt: Date | null;
  activities: CaseActivitySummary[];
  missingDataNotes: string[];
}

export interface RenderedClosingEmail {
  subject: string;
  bodyText: string;
}

const draftInclude = {
  recipientClient: {
    select: { id: true, name: true, contacts: { select: { id: true, name: true, email: true, isPrimary: true } } },
  },
} as const;

@Injectable()
export class ClosingEmailService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  async gatherCaseData(caseId: string): Promise<ClosingEmailCaseData> {
    const legalCase = await this.prisma.case.findUnique({
      where: { id: caseId },
    });
    if (!legalCase) {
      throw new NotFoundException('ไม่พบคดีนี้');
    }

    const activities = await this.prisma.caseActivity.findMany({
      where: { caseId },
      orderBy: { activityAt: 'desc' },
    });

    const missingDataNotes: string[] = [];
    if (!legalCase.closingSummary) {
      missingDataNotes.push(
        'ยังไม่มีสรุปผลคดี (closingSummary) — กรอกก่อนส่งอีเมลจริง',
      );
    }
    if (!legalCase.closedAt) {
      missingDataNotes.push(
        'คดียังไม่ถูกปิด — วันที่ปิดคดีในอีเมลจะยังว่างอยู่',
      );
    }

    return {
      caseId: legalCase.id,
      clientId: legalCase.clientId,
      ownRef: legalCase.ownRef,
      customerRef: legalCase.customerRef,
      clientName: legalCase.clientName,
      title: legalCase.title,
      courtName: legalCase.courtName,
      closingSummary: legalCase.closingSummary,
      closedAt: legalCase.closedAt,
      activities: activities.map((a) => ({
        id: a.id,
        title: a.title,
        description: a.description,
        activityAt: a.activityAt,
      })),
      missingDataNotes,
    };
  }

  renderDraft(
    data: ClosingEmailCaseData,
    selectedActivityIds: string[],
  ): RenderedClosingEmail {
    const selectedSet = new Set(selectedActivityIds);
    const chosenActivities = data.activities.filter((a) =>
      selectedSet.has(a.id),
    );

    const subject = `สรุปงาน: ${data.title} (${data.ownRef}) — ${data.clientName ?? ''}`;

    const timelineLines = chosenActivities
      .sort((a, b) => a.activityAt.getTime() - b.activityAt.getTime())
      .map(
        (a) =>
          `- ${a.activityAt.toLocaleDateString('th-TH')}: ${a.title}${
            a.description ? ` — ${a.description}` : ''
          }`,
      )
      .join('\n');

    const bodyText = [
      `เรียน ${data.clientName ?? 'ลูกความ'}`,
      '',
      `เรื่อง: ${data.title} (เลขอ้างอิงสำนักงาน ${data.ownRef}${
        data.customerRef ? `, เลขอ้างอิงลูกความ ${data.customerRef}` : ''
      })`,
      data.courtName ? `ศาล: ${data.courtName}` : '',
      '',
      'ลำดับการดำเนินงานที่สำคัญ:',
      timelineLines || '- (พิมพ์ลำดับการดำเนินงานที่นี่)',
      '',
      'ผลที่ได้รับ:',
      data.closingSummary ?? '(พิมพ์ผลที่ได้รับที่นี่)',
      '',
      'หากมีข้อสงสัยประการใด ติดต่อทนายเจ้าของคดีได้ตามช่องทางเดิม',
    ]
      .filter((line) => line !== '')
      .join('\n');

    return { subject, bodyText };
  }

  async createDraft(
    user: AuthUser,
    caseId: string,
    dto: CreateClosingEmailDraftDto,
  ) {
    const data = await this.gatherCaseData(caseId);
    const rendered = this.renderDraft(data, dto.selectedActivityIds);

    return this.prisma.closingEmailDraft.create({
      data: {
        caseId,
        createdById: user.id,
        recipientClientId: data.clientId ?? null,
        subject: rendered.subject,
        bodyText: rendered.bodyText,
        selectedActivityIds: dto.selectedActivityIds,
        missingDataNotes: data.missingDataNotes,
      },
      include: draftInclude,
    });
  }

  listDrafts(caseId: string) {
    return this.prisma.closingEmailDraft.findMany({
      where: { caseId },
      include: draftInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateDraft(
    caseId: string,
    draftId: string,
    dto: UpdateClosingEmailDraftDto,
  ) {
    const draft = await this.prisma.closingEmailDraft.findFirst({
      where: { id: draftId, caseId },
    });
    if (!draft) throw new NotFoundException('ไม่พบร่างอีเมลนี้');
    if (draft.status === ClosingEmailDraftStatus.APPROVED) {
      throw new BadRequestException('ร่างที่อนุมัติแล้วไม่สามารถแก้ไขได้');
    }

    return this.prisma.closingEmailDraft.update({
      where: { id: draftId },
      data: {
        subject: dto.subject ?? draft.subject,
        bodyText: dto.bodyText ?? draft.bodyText,
      },
      include: draftInclude,
    });
  }

  async approveDraft(user: AuthUser, caseId: string, draftId: string, dto: ApproveClosingEmailDraftDto) {
    const draft = await this.prisma.closingEmailDraft.findFirst({
      where: { id: draftId, caseId, case: { firmId: user.firmId } },
    });
    if (!draft) throw new NotFoundException('ไม่พบร่างอีเมลนี้');
    if (draft.status === ClosingEmailDraftStatus.APPROVED) throw new BadRequestException('ร่างนี้อนุมัติไปแล้ว');
    if (!this.email.isConfigured()) throw new BadRequestException('ระบบยังไม่ได้ตั้งค่าการส่งอีเมล ติดต่อผู้ดูแลระบบ');
    if (!draft.recipientClientId) throw new BadRequestException('ร่างนี้ไม่มีลูกความผู้รับ');

    const contacts = await this.prisma.clientContact.findMany({
      where: { id: { in: dto.contactIds }, clientId: draft.recipientClientId, email: { not: null } },
      select: { id: true, email: true },
    });
    if (contacts.length !== new Set(dto.contactIds).size) {
      throw new BadRequestException('เลือกได้เฉพาะผู้ติดต่อของลูกความรายนี้ที่มีอีเมล');
    }

    // Claim first: a double click must not send twice.
    const claimed = await this.prisma.closingEmailDraft.updateMany({
      where: { id: draftId, status: ClosingEmailDraftStatus.DRAFT },
      data: { status: ClosingEmailDraftStatus.APPROVED },
    });
    if (!claimed.count) throw new BadRequestException('ร่างนี้อนุมัติไปแล้ว');

    const sentTo: string[] = [];
    for (const contact of contacts) {
      const ok = await this.email.sendClosingEmail({
        to: contact.email!,
        subject: draft.subject,
        bodyText: draft.bodyText,
        firmName: user.firmName,
      });
      if (ok) sentTo.push(contact.email!);
    }
    if (!sentTo.length) {
      await this.prisma.closingEmailDraft.updateMany({
        where: { id: draftId },
        data: { status: ClosingEmailDraftStatus.DRAFT },
      });
      throw new BadRequestException('ส่งอีเมลไม่สำเร็จ กรุณาลองใหม่');
    }

    return this.prisma.closingEmailDraft.update({
      where: { id: draftId },
      data: {
        status: ClosingEmailDraftStatus.APPROVED,
        approvedById: user.id,
        approvedAt: new Date(),
        sentAt: new Date(),
        sentTo,
      },
      include: draftInclude,
    });
  }
}
