import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module';

@Injectable()
export class TemplatesService {
  constructor(private prisma: PrismaService) {}

  findAll(caseTypeId?: string) {
    return this.prisma.documentTemplate.findMany({
      where: caseTypeId ? { OR: [{ caseTypeId }, { caseTypeId: null }] } : undefined,
      include: { caseType: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async render(templateId: string, caseId: string) {
    const template = await this.prisma.documentTemplate.findUnique({
      where: { id: templateId },
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
