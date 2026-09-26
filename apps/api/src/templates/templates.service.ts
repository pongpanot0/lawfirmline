import { Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { DocumentsService } from '../documents/documents.service';
import { buildDocx } from './docx-builder';

const PLAINTIFF_ROLES = ['PLAINTIFF', 'JOINT_PLAINTIFF'];
const DEFENDANT_ROLES = ['DEFENDANT', 'JOINT_DEFENDANT'];

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

  create(firmId: string, dto: TemplateInput) {
    return this.prisma.documentTemplate.create({ data: { ...dto, firmId } });
  }

  /** Only the firm's own templates are editable — built-ins (firmId null) are not. */
  private async ownTemplate(firmId: string, id: string) {
    const template = await this.prisma.documentTemplate.findFirst({ where: { id, firmId } });
    if (!template) throw new NotFoundException('ไม่พบ template ของสำนักงานนี้');
    return template;
  }

  async update(firmId: string, id: string, dto: Partial<TemplateInput>) {
    await this.ownTemplate(firmId, id);
    return this.prisma.documentTemplate.update({ where: { id }, data: dto });
  }

  async remove(firmId: string, id: string) {
    await this.ownTemplate(firmId, id);
    await this.prisma.documentTemplate.delete({ where: { id } });
    return { deleted: true };
  }

  async render(firmId: string, templateId: string, caseId: string) {
    const template = await this.prisma.documentTemplate.findFirst({
      where: { id: templateId, OR: [{ firmId }, { firmId: null }] },
    });
    if (!template) return null;

    const legalCase = await this.prisma.case.findUnique({
      where: { id: caseId },
      include: { caseType: true, leadLawyer: true, participants: true },
    });
    if (!legalCase) return null;

    const plaintiffNames = legalCase.participants
      .filter((p) => PLAINTIFF_ROLES.includes(p.role))
      .map((p) => p.name)
      .join(', ');
    const defendantNames = legalCase.participants
      .filter((p) => DEFENDANT_ROLES.includes(p.role))
      .map((p) => p.name)
      .join(', ');

    const vars: Record<string, string> = {
      ownRef: legalCase.ownRef,
      caseNumber: legalCase.ownRef,
      customerRef: legalCase.customerRef ?? '',
      clientName: legalCase.clientName ?? '',
      courtName: legalCase.courtName ?? '',
      folderId: legalCase.folderId,
      title: legalCase.title,
      caseType: legalCase.caseType?.name ?? '',
      date: new Date().toLocaleDateString('th-TH'),
      blackCaseNumber: legalCase.blackCaseNumber ?? '',
      redCaseNumber: legalCase.redCaseNumber ?? '',
      plaintiffNames,
      defendantNames,
      lawyerName: `${legalCase.leadLawyer.firstName} ${legalCase.leadLawyer.lastName}`,
      // ponytail: no license-number field exists on User/FirmMember yet — leave
      // {{lawyerLicenseNo}} unfilled (reported missing) until one is added.
    };

    const usedKeys = [...template.templateBody.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
    const missingFields = [
      ...new Set(usedKeys.filter((key) => !(key in vars) || vars[key] === '')),
    ];

    let body = template.templateBody;
    for (const [key, value] of Object.entries(vars)) {
      body = body.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    }

    return { name: template.name, content: body, variables: vars, missingFields };
  }

  async generate(user: AuthUser, caseId: string, templateId: string) {
    const rendered = await this.render(user.firmId, templateId, caseId);
    if (!rendered) throw new NotFoundException('ไม่พบ template หรือคดีนี้');

    const legalCase = await this.prisma.case.findUnique({ where: { id: caseId } });
    const buffer = await buildDocx(rendered.name, rendered.content);
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
