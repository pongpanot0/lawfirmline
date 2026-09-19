import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module';

export interface TemplateInput {
  name: string;
  description?: string;
  templateBody: string;
  caseTypeId?: string | null;
}

@Injectable()
export class TemplatesService {
  constructor(private prisma: PrismaService) {}

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
      include: { caseType: true },
    });
    if (!legalCase) return null;

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
    };

    let body = template.templateBody;
    for (const [key, value] of Object.entries(vars)) {
      body = body.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    }

    return { name: template.name, content: body };
  }
}
