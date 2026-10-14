import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { TemplatesService } from '../templates/templates.service';
import { BUILT_IN_EMAIL_TEMPLATES, EMAIL_TEMPLATE_VARIABLES, EmailTemplateView } from './built-in-email-templates';
import { fillPlaceholders } from './fill-placeholders';

export interface EmailTemplateInput {
  name: string;
  subject: string;
  body: string;
}

const pick = (t: { id: string; name: string; subject: string; body: string }): EmailTemplateView => ({
  id: t.id,
  name: t.name,
  subject: t.subject,
  body: t.body,
  builtIn: false,
});

@Injectable()
export class EmailTemplatesService {
  constructor(
    private prisma: PrismaService,
    private templates: TemplatesService,
  ) {}

  async list(firmId: string): Promise<EmailTemplateView[]> {
    const rows = await this.prisma.emailTemplate.findMany({ where: { firmId }, orderBy: { name: 'asc' } });
    return [...BUILT_IN_EMAIL_TEMPLATES, ...rows.map(pick)];
  }

  variables() {
    return EMAIL_TEMPLATE_VARIABLES;
  }

  private audit(user: AuthUser, action: string, metadata: Record<string, unknown>) {
    return this.prisma.auditLog.create({ data: { firmId: user.firmId, userId: user.id, action, metadata } as never });
  }

  private async own(user: AuthUser, id: string) {
    if (id.startsWith('builtin:')) throw new BadRequestException('เทมเพลตตัวอย่างแก้ไขหรือลบไม่ได้ — กด "คัดลอกไปแก้" แทน');
    const row = await this.prisma.emailTemplate.findFirst({ where: { id, firmId: user.firmId } });
    if (!row) throw new NotFoundException('ไม่พบเทมเพลตนี้');
    return row;
  }

  async create(user: AuthUser, dto: EmailTemplateInput) {
    const row = await this.prisma.emailTemplate.create({
      data: { firmId: user.firmId, name: dto.name, subject: dto.subject, body: dto.body, createdById: user.id },
    });
    await this.audit(user, 'EMAIL_TEMPLATE_CREATED', { templateId: row.id, name: row.name });
    return pick(row);
  }

  async update(user: AuthUser, id: string, dto: Partial<EmailTemplateInput>) {
    await this.own(user, id);
    const row = await this.prisma.emailTemplate.update({ where: { id }, data: dto });
    await this.audit(user, 'EMAIL_TEMPLATE_UPDATED', { templateId: id, name: row.name });
    return pick(row);
  }

  async remove(user: AuthUser, id: string) {
    const row = await this.own(user, id);
    await this.prisma.emailTemplate.delete({ where: { id } });
    await this.audit(user, 'EMAIL_TEMPLATE_DELETED', { templateId: id, name: row.name });
    return { deleted: true };
  }

  async render(user: AuthUser, caseId: string, id: string) {
    const template = id.startsWith('builtin:')
      ? BUILT_IN_EMAIL_TEMPLATES.find((t) => t.id === id)
      : await this.prisma.emailTemplate.findFirst({ where: { id, firmId: user.firmId } });
    if (!template) throw new NotFoundException('ไม่พบเทมเพลตนี้');

    const vars = { ...(await this.templates.caseVariables(user.firmId, caseId)), senderName: `${user.firstName} ${user.lastName}`.trim() };
    const subject = fillPlaceholders(template.subject, vars);
    const body = fillPlaceholders(template.body, vars);
    const labels = new Map<string, string>(EMAIL_TEMPLATE_VARIABLES.map((v) => [v.key, v.label]));
    const keys = [...new Set([...subject.missing, ...body.missing])];
    return {
      subject: subject.text,
      body: body.text,
      missing: keys.map((key) => ({ key, label: labels.get(key) ?? key })),
    };
  }
}
