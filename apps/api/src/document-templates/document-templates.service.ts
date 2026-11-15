import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser, DocumentType, hasFirmCapability, REQUIRED_VAT_BLOCKS, STANDARD_V1_LAYOUT, TemplateLayout, validateTemplateLayout } from '@lawfirm/shared';
import { Prisma } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.module';
import { BindDocumentTemplatesDto, CreateDocumentTemplateDto, UpdateDocumentTemplateDto } from './dto/document-templates.dto';

export interface TemplateSnapshot {
  templateId: string | null;
  name: string;
  version: number;
  layout: TemplateLayout;
  logoKey: string | null;
}

async function activeTemplate(db: Prisma.TransactionClient, firmId: string, id: string, docType?: DocumentType) {
  const template = await db.billingDocumentTemplate.findFirst({ where: { id, firmId, archivedAt: null, ...(docType ? { docType } : {}) } });
  if (!template) throw new NotFoundException('ไม่พบแม่แบบเอกสารของสำนักงานสำหรับประเภทนี้');
  return template;
}

export async function resolveTemplate(db: Prisma.TransactionClient, firmId: string, docType: DocumentType, customerId?: string | null, templateId?: string): Promise<TemplateSnapshot> {
  const firm = await db.firm.findUnique({ where: { id: firmId }, select: { vatRegistered: true, logoKey: true } });
  if (!firm) throw new NotFoundException('ไม่พบสำนักงาน');
  const customer = customerId ? await db.client.findFirst({ where: { id: customerId, firmId }, select: { invoiceTemplateId: true, receiptTemplateId: true } }) : null;
  if (customerId && !customer) throw new NotFoundException('ไม่พบลูกค้าของสำนักงาน');
  const boundId = docType === 'INVOICE' ? customer?.invoiceTemplateId : customer?.receiptTemplateId;
  // Archived customer bindings fall through to the current default; explicit choices must fail.
  const selected = templateId ? await activeTemplate(db, firmId, templateId, docType)
    : boundId ? await db.billingDocumentTemplate.findFirst({ where: { id: boundId, firmId, docType, archivedAt: null } }) : null;
  const template = selected ?? await db.billingDocumentTemplate.findFirst({ where: { firmId, docType, archivedAt: null, isDefault: true } });
  const layout: TemplateLayout = JSON.parse(JSON.stringify(template?.layout ?? STANDARD_V1_LAYOUT));
  const errors = validateTemplateLayout(layout, { vatRegistered: false, docType });
  if (errors.length) throw new BadRequestException(errors);
  if (firm.vatRegistered) {
    for (const type of REQUIRED_VAT_BLOCKS) {
      const blocks = layout.blocks.filter(b => b.type === type);
      if (blocks.length) blocks.forEach(b => { b.hidden = false; });
      else {
        const block = { ...STANDARD_V1_LAYOUT.blocks.find(b => b.type === type)! };
        while (layout.blocks.some(b => b.id === block.id)) block.id += '-required';
        layout.blocks.push(block);
      }
    }
  }
  return { templateId: template?.id ?? null, name: template?.name ?? 'standard-v1', version: template?.version ?? 1,
    layout, logoKey: template?.logoKey ?? firm.logoKey ?? null };
}

@Injectable()
export class DocumentTemplatesService {
  constructor(private prisma: PrismaService) {}

  private authorize(user: AuthUser, edit = false) {
    if (!hasFirmCapability(user.firmRole, edit ? 'manageSubscription' : 'manageInvoices')) throw new ForbiddenException('ไม่มีสิทธิ์จัดการแม่แบบเอกสาร');
  }

  list(user: AuthUser, docType?: DocumentType) {
    this.authorize(user);
    return this.prisma.billingDocumentTemplate.findMany({ where: { firmId: user.firmId, archivedAt: null, ...(docType ? { docType } : {}) }, orderBy: [{ docType: 'asc' }, { name: 'asc' }, { id: 'asc' }] });
  }

  get(user: AuthUser, id: string) {
    this.authorize(user);
    return activeTemplate(this.prisma, user.firmId, id);
  }

  resolve(user: AuthUser, docType: DocumentType, customerId?: string, templateId?: string) {
    this.authorize(user);
    return resolveTemplate(this.prisma, user.firmId, docType, customerId, templateId);
  }

  private async lockFirm(tx: Prisma.TransactionClient, firmId: string) {
    await tx.$queryRaw`SELECT "id" FROM "Firm" WHERE "id" = ${firmId} FOR UPDATE`;
    const firm = await tx.firm.findUnique({ where: { id: firmId } });
    if (!firm) throw new NotFoundException('ไม่พบสำนักงาน');
    return firm;
  }

  private validate(layout: unknown, vatRegistered: boolean, docType: DocumentType) {
    const errors = validateTemplateLayout(layout, { vatRegistered, docType });
    if (errors.length) throw new BadRequestException(errors);
  }

  create(user: AuthUser, dto: CreateDocumentTemplateDto) {
    this.authorize(user, true);
    return this.prisma.$transaction(async tx => {
      const firm = await this.lockFirm(tx, user.firmId);
      const source = dto.copyFromId ? await activeTemplate(tx, user.firmId, dto.copyFromId, dto.docType) : null;
      const layout = dto.layout ?? source?.layout ?? STANDARD_V1_LAYOUT;
      this.validate(layout, firm.vatRegistered, dto.docType);
      return tx.billingDocumentTemplate.create({ data: { firmId: user.firmId, createdById: user.id, name: dto.name,
        docType: dto.docType, layout: layout as unknown as Prisma.InputJsonValue, logoKey: source?.logoKey } });
    });
  }

  update(user: AuthUser, id: string, dto: UpdateDocumentTemplateDto) {
    this.authorize(user, true);
    return this.prisma.$transaction(async tx => {
      const firm = await this.lockFirm(tx, user.firmId);
      const template = await activeTemplate(tx, user.firmId, id);
      this.validate(dto.layout ?? template.layout, firm.vatRegistered, template.docType);
      if (dto.logoKey != null && !new RegExp(`^firms/${user.firmId}/billing/logos/[a-f0-9-]{36}\\.(png|jpg|svg)$`).test(dto.logoKey)) {
        throw new BadRequestException('เลือกโลโก้ของสำนักงานนี้');
      }
      if (dto.isDefault === true) await tx.billingDocumentTemplate.updateMany({ where: { firmId: user.firmId, docType: template.docType, archivedAt: null, isDefault: true }, data: { isDefault: false } });
      return tx.billingDocumentTemplate.update({ where: { id, firmId: user.firmId }, data: { name: dto.name, logoKey: dto.logoKey,
        isDefault: dto.isDefault, ...(dto.layout !== undefined ? { layout: dto.layout as unknown as Prisma.InputJsonValue, version: { increment: 1 } } : {}) } });
    });
  }

  archive(user: AuthUser, id: string) {
    this.authorize(user, true);
    return this.prisma.$transaction(async tx => {
      await this.lockFirm(tx, user.firmId);
      const template = await activeTemplate(tx, user.firmId, id);
      if (template.isDefault) throw new BadRequestException('ยกเลิกการเป็นแม่แบบหลักก่อนเก็บเข้าคลัง');
      return tx.billingDocumentTemplate.update({ where: { id, firmId: user.firmId }, data: { archivedAt: new Date() } });
    });
  }

  bind(user: AuthUser, customerId: string, dto: BindDocumentTemplatesDto) {
    this.authorize(user, true);
    return this.prisma.$transaction(async tx => {
      await this.lockFirm(tx, user.firmId);
      if (!await tx.client.findFirst({ where: { id: customerId, firmId: user.firmId } })) throw new NotFoundException('ไม่พบลูกค้าของสำนักงาน');
      if (dto.invoiceTemplateId != null) await activeTemplate(tx, user.firmId, dto.invoiceTemplateId, 'INVOICE');
      if (dto.receiptTemplateId != null) await activeTemplate(tx, user.firmId, dto.receiptTemplateId, 'RECEIPT');
      return tx.client.update({ where: { id: customerId, firmId: user.firmId }, data: { invoiceTemplateId: dto.invoiceTemplateId, receiptTemplateId: dto.receiptTemplateId } });
    });
  }
}
