import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { DocumentsService } from '../documents/documents.service';
import { buildDocx } from './docx-builder';

const PLAINTIFF_ROLES = ['PLAINTIFF', 'JOINT_PLAINTIFF', 'PETITIONER'];
const DEFENDANT_ROLES = ['DEFENDANT', 'JOINT_DEFENDANT', 'RESPONDENT'];

const VAR_INCLUDE = { caseType: true, leadLawyer: true, participants: true, client: true, proceedings: true } as const;

export interface TemplateInput {
  name: string;
  description?: string;
  templateBody: string;
  caseTypeId?: string | null;
}

@Injectable()
export class TemplatesService {
  constructor(
    private prisma: PrismaService,
    private documentsService: DocumentsService,
  ) {}

  findAll(firmId: string, caseTypeId?: string) {
    return this.prisma.documentTemplate.findMany({
      where: {
        OR: [{ firmId }, { firmId: null }],
        ...(caseTypeId ? { AND: [{ OR: [{ caseTypeId }, { caseTypeId: null }] }] } : {}),
      },
      include: { caseType: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
    });
  }

  /** firmId null = a built-in every firm sees; only /platform (superadmin) passes null. */
  create(firmId: string | null, dto: TemplateInput) {
    return this.prisma.documentTemplate.create({ data: { ...dto, firmId } });
  }

  findBuiltIns() {
    return this.prisma.documentTemplate.findMany({ where: { firmId: null }, orderBy: { name: 'asc' } });
  }

  /** A firm edits only its own templates; built-ins (firmId null) only through /platform. */
  private async ownTemplate(firmId: string | null, id: string) {
    const template = await this.prisma.documentTemplate.findFirst({ where: { id, firmId } });
    if (!template) throw new NotFoundException('ไม่พบ template ของสำนักงานนี้');
    return template;
  }

  async update(firmId: string | null, id: string, dto: Partial<TemplateInput>) {
    await this.ownTemplate(firmId, id);
    return this.prisma.documentTemplate.update({ where: { id }, data: dto });
  }

  async remove(firmId: string | null, id: string) {
    await this.ownTemplate(firmId, id);
    await this.prisma.documentTemplate.delete({ where: { id } });
    return { deleted: true };
  }

  private loadCase(where: { id: string; firmId?: string }) {
    return this.prisma.case.findFirst({ where, include: VAR_INCLUDE });
  }

  private buildVars(legalCase: NonNullable<Awaited<ReturnType<TemplatesService['loadCase']>>>): Record<string, string> {
    const plaintiffNames = legalCase.participants
      .filter((p) => PLAINTIFF_ROLES.includes(p.role))
      .map((p) => p.name)
      .join(', ');
    const defendantNames = legalCase.participants
      .filter((p) => DEFENDANT_ROLES.includes(p.role))
      .map((p) => p.name)
      .join(', ');

    const atLevel = (level: string) => legalCase.proceedings.find((p) => p.courtLevel === level);
    const trial = atLevel('TRIAL');
    const appeal = atLevel('APPEAL');
    const supreme = atLevel('SUPREME');

    return {
      ownRef: legalCase.ownRef,
      caseNumber: legalCase.ownRef,
      customerRef: legalCase.customerRef ?? '',
      clientName: legalCase.clientName || legalCase.client?.name || '',
      courtName: legalCase.courtName ?? '',
      folderId: legalCase.folderId,
      title: legalCase.title,
      caseType: legalCase.caseType?.name ?? '',
      date: new Date().toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok' }),
      blackCaseNumber: legalCase.blackCaseNumber ?? '',
      redCaseNumber: legalCase.redCaseNumber ?? '',
      plaintiffNames,
      defendantNames,
      trialCourtName: trial?.courtName ?? '',
      trialBlackCaseNumber: trial?.blackCaseNumber ?? '',
      trialRedCaseNumber: trial?.redCaseNumber ?? '',
      appealBlackCaseNumber: appeal?.blackCaseNumber ?? '',
      appealRedCaseNumber: appeal?.redCaseNumber ?? '',
      supremeBlackCaseNumber: supreme?.blackCaseNumber ?? '',
      supremeRedCaseNumber: supreme?.redCaseNumber ?? '',
      lawyerName: `${legalCase.leadLawyer.firstName} ${legalCase.leadLawyer.lastName}`,
      // ponytail: no license-number field exists on User/FirmMember yet — leave
      // {{lawyerLicenseNo}} unfilled (reported missing) until one is added.
    };
  }

  /** Case variables for any template engine, plus the next future COURT_DATE (Bangkok time). */
  async caseVariables(firmId: string, caseId: string): Promise<Record<string, string>> {
    const legalCase = await this.loadCase({ id: caseId, firmId });
    if (!legalCase) throw new NotFoundException('ไม่พบคดีนี้');
    const hearing = await this.prisma.calendarEvent.findFirst({
      where: { caseId, type: 'COURT_DATE', startAt: { gte: new Date() } },
      orderBy: { startAt: 'asc' },
      select: { startAt: true, courtName: true },
    });
    const tz = 'Asia/Bangkok';
    return {
      ...this.buildVars(legalCase),
      nextHearingDate: hearing ? hearing.startAt.toLocaleDateString('th-TH', { timeZone: tz, day: 'numeric', month: 'long', year: 'numeric' }) : '',
      nextHearingTime: hearing ? hearing.startAt.toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }) : '',
      nextHearingCourt: hearing ? (hearing.courtName ?? legalCase.courtName ?? '') : '',
    };
  }

  async render(firmId: string, templateId: string, caseId: string) {
    const template = await this.prisma.documentTemplate.findFirst({
      where: { id: templateId, OR: [{ firmId }, { firmId: null }] },
    });
    if (!template) return null;

    const legalCase = await this.prisma.case.findUnique({
      where: { id: caseId },
      include: VAR_INCLUDE,
    });
    if (!legalCase) return null;

    const vars = this.buildVars(legalCase);

    const usedKeys = [...template.templateBody.matchAll(/\{\{([^{}]+)\}\}/g)].map((m) => m[1]);
    const missingFields = [
      ...new Set(usedKeys.filter((key) => !(key in vars) || vars[key] === '')),
    ];

    let body = template.templateBody;
    for (const [key, value] of Object.entries(vars)) {
      if (value) body = body.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), () => value);
    }

    return { name: template.name, content: body, variables: vars, missingFields };
  }

  async generate(user: AuthUser, caseId: string, templateId: string, content?: string) {
    const rendered = await this.render(user.firmId, templateId, caseId);
    if (!rendered) throw new NotFoundException('ไม่พบ template หรือคดีนี้');

    const legalCase = await this.prisma.case.findUnique({ where: { id: caseId } });
    if (content !== undefined && (!content.trim() || /\{\{[^{}]+\}\}/.test(content))) {
      throw new BadRequestException('เติมช่อง {{ข้อมูล}} ในร่างให้ครบก่อนสร้างเอกสาร');
    }
    const buffer = await buildDocx(rendered.name, content ?? rendered.content);
    const ref = legalCase?.ownRef ?? caseId.slice(0, 8);
    const filename = `${rendered.name}-${ref}.docx`;

    const document = await this.documentsService.createFromBuffer(user, caseId, {
      filename,
      buffer,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });

    return { documentId: document.id, filename };
  }
}
