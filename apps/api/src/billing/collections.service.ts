import { resolveTemplate } from '../document-templates/document-templates.service';
import { Injectable, Logger, BadRequestException, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { AuthUser, FirmRole, hasFirmCapability } from '@lawfirm/shared';
import { InvoiceStatus, Invoice, InvoicePayment, Prisma } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.module';
import { CollectionFollowUpDto, RecordPaymentDto, ClearChequeDto } from './dto/billing.dto';
import { agingBucket, daysOverdue, summarizeBuckets } from './receivables';
import { LineMessagingService } from '../notifications/line-messaging.service';
import { ContactNotificationPreferenceService } from '../notifications/contact-notification-preference.service';
import { bangkokMonthOf, monthRange } from '../operations/owner-kpis';
import { unbilledExpenseWhere, unbilledTimeWhere } from './unbilled';
import { bangkokDayKey } from '../common/utils/bangkok-time';

import { settledAmount } from './settlement';
import { issueReceipt } from './receipts.service';

const round = (n: number) => Math.round(n * 100) / 100;
const DAY_MS = 86400000;
const INVOICE_INCLUDE = {
  payments: true,
  billToCustomer: { select: { name: true, type: true } },
  intake: { select: { title: true, clientName: true } },
  case: { select: { ownRef: true, title: true, clientName: true, client: { select: { name: true, type: true } } } },
  collectionOwner: { select: { id: true, firstName: true, lastName: true } },
} as const;

@Injectable()
export class CollectionsService {
  private readonly logger = new Logger(CollectionsService.name);

  constructor(
    private prisma: PrismaService,
    private lineMessaging: LineMessagingService,
    private contactPrefs: ContactNotificationPreferenceService,
  ) {}

  private owner(user: AuthUser) {
    if (!hasFirmCapability(user.firmRole, 'manageInvoices')) throw new ForbiddenException('Insufficient permissions');
  }

  private row(invoice: Prisma.InvoiceGetPayload<{ include: typeof INVOICE_INCLUDE }>, today: Date) {
    const paidAmount = round(settledAmount(invoice.payments));
    const days = daysOverdue(invoice.dueAt, today);
    return {
      id: invoice.id, invoiceNumber: invoice.invoiceNumber, status: invoice.status,
      customerName: invoice.billToCustomer?.name ?? invoice.case?.client?.name ?? invoice.case?.clientName ?? invoice.intake?.clientName ?? null,
      clientType: invoice.billToCustomer?.type ?? invoice.case?.client?.type ?? null,
      caseId: invoice.caseId, caseRef: invoice.case?.ownRef ?? null,
      subject: invoice.case?.title ?? invoice.intake?.title ?? 'ใบแจ้งหนี้สำนักงาน',
      totalAmount: invoice.totalAmount, paidAmount, outstanding: round(invoice.totalAmount - paidAmount),
      issuedAt: invoice.issuedAt?.toISOString() ?? null, dueAt: invoice.dueAt?.toISOString() ?? null,
      daysOverdue: days, bucket: agingBucket(days), lastReminderAt: invoice.lastReminderAt?.toISOString() ?? null,
      collectionOwner: invoice.collectionOwner ?? null,
      collectionNextAt: invoice.collectionNextAt?.toISOString().slice(0, 10) ?? null,
      collectionNote: invoice.collectionNote ?? null, updatedAt: invoice.updatedAt?.toISOString() ?? null,
      // เช็คที่ยังไม่ผ่าน — hub แสดง "เช็ครอเคลียร์" โดยไม่ต้องดึงรายการรับเงินทีละใบ
      pendingCheques: invoice.payments
        .filter(p => p.clearedAt == null)
        .map(p => ({ id: p.id, amount: p.amount, whtAmount: p.whtAmount, receivedAt: p.receivedAt.toISOString().slice(0, 10) })),
    };
  }

  async getInvoice(user: AuthUser, invoiceId: string) {
    this.owner(user);
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, firmId: user.firmId }, include: { ...INVOICE_INCLUDE, lineItems: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] } },
    });
    if (!invoice) throw new NotFoundException('ไม่พบใบแจ้งหนี้');
    return { ...this.row(invoice, new Date()), lineItems: invoice.lineItems,
      payments: invoice.payments.sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime()),
    };
  }

  async ownerWorklist(user: AuthUser, month?: string) {
    this.owner(user);
    const resolvedMonth = month ?? bangkokMonthOf(new Date());
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(resolvedMonth)) throw new BadRequestException('เดือนต้องเป็น YYYY-MM');
    const { start, end } = monthRange(resolvedMonth);
    const caseSelect = { id: true, ownRef: true, title: true, clientName: true,
      leadLawyer: { select: { id: true, firstName: true, lastName: true } } } as const;
    // ponytail: full worklists suit a small office; paginate rows separately from totals when volume grows.
    const [invoices, payments, timeEntries, expenses, payable] = await Promise.all([
      this.prisma.invoice.findMany({ where: { firmId: user.firmId }, include: INVOICE_INCLUDE, orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }] }),
      this.prisma.invoicePayment.findMany({ where: { firmId: user.firmId, clearedAt: { gte: start, lt: end } },
        include: { invoice: { select: { invoiceNumber: true } } }, orderBy: [{ receivedAt: 'desc' }, { id: 'asc' }] }),
      this.prisma.timeEntry.findMany({ where: { ...unbilledTimeWhere(), case: { firmId: user.firmId, deletedAt: null } },
        include: { case: { select: caseSelect } }, orderBy: { date: 'asc' } }),
      this.prisma.expense.findMany({ where: { ...unbilledExpenseWhere(), case: { firmId: user.firmId, deletedAt: null } },
        include: { case: { select: caseSelect } }, orderBy: { date: 'asc' } }),
      this.prisma.expense.findMany({ where: { status: 'APPROVED', OR: [
        { case: { firmId: user.firmId } },
        { caseId: null, claim: { firmId: user.firmId } },
        // Old office lines lack a firm ID. Only a single firm membership can establish their scope.
        { caseId: null, claimId: null, user: { firmMembers: { some: { firmId: user.firmId }, none: { firmId: { not: user.firmId } } } } },
      ] }, select: { id: true, claimId: true, amount: true, description: true, date: true,
        case: { select: { id: true, ownRef: true } }, user: { select: { firstName: true, lastName: true } } }, orderBy: { date: 'asc' } }),
    ]);
    const groups = new Map<string, { case: (typeof timeEntries)[number]['case']; amount: number; hours: number;
      timeEntryIds: string[]; expenseIds: string[]; lines: { id: string; kind: string; description: string; amount: number; date: string }[] }>();
    const groupFor = (legalCase: (typeof timeEntries)[number]['case']) => {
      let group = groups.get(legalCase.id);
      if (!group) { group = { case: legalCase, amount: 0, hours: 0, timeEntryIds: [], expenseIds: [], lines: [] }; groups.set(legalCase.id, group); }
      return group;
    };
    for (const entry of timeEntries) {
      const group = groupFor(entry.case), amount = entry.hours * entry.rate;
      group.hours += entry.hours; group.amount += amount; group.timeEntryIds.push(entry.id);
      group.lines.push({ id: entry.id, kind: 'TIME', description: entry.description ?? 'บันทึกเวลา', amount: round(amount), date: entry.date.toISOString() });
    }
    for (const expense of expenses) if (expense.case) {
      const group = groupFor(expense.case); group.amount += expense.amount; group.expenseIds.push(expense.id);
      group.lines.push({ id: expense.id, kind: 'EXPENSE', description: expense.description, amount: expense.amount, date: expense.date.toISOString() });
    }
    const rows = invoices.map(invoice => this.row(invoice, new Date()));
    const receivables = rows.filter(row => row.status === InvoiceStatus.SENT && row.outstanding > 0.005);
    const billed = rows.filter(row => row.status !== InvoiceStatus.DRAFT && row.issuedAt && new Date(row.issuedAt) >= start && new Date(row.issuedAt) < end);
    const unbilled = [...groups.values()].map(group => ({ ...group, amount: round(group.amount), hours: round(group.hours) }));
    const drafts = rows.filter(row => row.status === InvoiceStatus.DRAFT);
    return {
      month: resolvedMonth,
      totals: { received: settledAmount(payments),
        billed: round(billed.reduce((sum, row) => sum + row.totalAmount, 0)),
        unbilled: round(unbilled.reduce((sum, group) => sum + group.amount, 0) + drafts.reduce((sum, row) => sum + row.totalAmount, 0)),
        payable: round(payable.reduce((sum, expense) => sum + expense.amount, 0)),
        receivable: round(receivables.reduce((sum, row) => sum + row.outstanding, 0)) },
      receivables, unbilled, billed, payable, receipts: payments, drafts,
    };
  }

  async setFollowUp(user: AuthUser, invoiceId: string, dto: CollectionFollowUpDto) {
    this.owner(user);
    if (dto.ownerId && !await this.prisma.firmMember.findFirst({ where: { firmId: user.firmId, userId: dto.ownerId, role: { not: FirmRole.EXTERNAL } } })) {
      throw new BadRequestException('ผู้ติดตามต้องเป็นสมาชิกสำนักงานนี้');
    }
    const changed = await this.prisma.invoice.updateMany({
      where: { id: invoiceId, firmId: user.firmId, status: InvoiceStatus.SENT, updatedAt: new Date(dto.updatedAt) },
      data: { collectionOwnerId: dto.ownerId, collectionNextAt: dto.nextAt ? new Date(dto.nextAt) : dto.nextAt, collectionNote: dto.note },
    });
    if (!changed.count) {
      const invoice = await this.prisma.invoice.findFirst({ where: { id: invoiceId, firmId: user.firmId } });
      if (!invoice) throw new NotFoundException('ไม่พบใบแจ้งหนี้');
      throw new ConflictException('ใบแจ้งหนี้เปลี่ยนแล้วหรือไม่มียอดให้ตาม กรุณาโหลดล่าสุด');
    }
    return this.getInvoice(user, invoiceId);
  }

  async markSent(user: AuthUser, invoiceId: string, templateId?: string): Promise<Invoice> {
    this.owner(user);
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "Invoice" WHERE "id" = ${invoiceId} AND "firmId" = ${user.firmId} FOR UPDATE`;
      const invoice = await tx.invoice.findFirst({ where: { id: invoiceId, firmId: user.firmId } });
      if (!invoice) throw new NotFoundException('Invoice not found');
      if (invoice.status !== InvoiceStatus.DRAFT) throw new BadRequestException('ส่งได้เฉพาะใบแจ้งหนี้ฉบับร่าง');
      const keptTemplateId = (invoice.templateSnapshot as { templateId?: string } | null)?.templateId ?? undefined;
      const templateSnapshot = await resolveTemplate(tx, user.firmId, 'INVOICE', invoice.billToCustomerId, templateId ?? keptTemplateId);
      // Freeze the issuer's legal details with the invoice, like receipts do, so reprints never change.
      const firmRow = await tx.firm.findUnique({ where: { id: user.firmId }, select: { legalName: true, taxId: true, taxBranch: true, billingAddress: true, vatRegistered: true, logoKey: true } });
      const firmSnapshot = firmRow ? { legalName: firmRow.legalName, taxId: firmRow.taxId, taxBranch: firmRow.taxBranch, address: firmRow.billingAddress, vatRegistered: firmRow.vatRegistered, logoKey: firmRow.logoKey } : null;
      const issuedAt = new Date();
      const dueAt = invoice.dueAt ?? new Date(issuedAt.getTime() + 30 * DAY_MS);
      return tx.invoice.update({
        where: { id: invoiceId, firmId: user.firmId, status: InvoiceStatus.DRAFT },
        data: { status: InvoiceStatus.SENT, issuedAt, dueAt, templateSnapshot: { ...templateSnapshot, firm: firmSnapshot } as unknown as Prisma.InputJsonValue },
      });
    }).catch(error => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') throw new ConflictException('สถานะใบแจ้งหนี้เปลี่ยนแล้ว กรุณาโหลดล่าสุด');
      throw error;
    });
  }

  async recordPayment(
    user: AuthUser,
    invoiceId: string,
    dto: RecordPaymentDto,
  ) {
    this.owner(user);
    const whtAmount = dto.whtAmount ?? 0;
    if (!Number.isFinite(dto.amount) || dto.amount <= 0 || !Number.isFinite(whtAmount) || whtAmount < 0) {
      throw new BadRequestException('ระบุยอดรับมากกว่า 0 และภาษีหัก ณ ที่จ่ายไม่ติดลบ');
    }
    const receivedAt = new Date(dto.receivedAt);
    if (Number.isNaN(receivedAt.getTime()) || bangkokDayKey(receivedAt) > bangkokDayKey(new Date())) {
      throw new BadRequestException('วันที่รับเงินต้องเป็นวันที่รับจริงและไม่อยู่ในอนาคต');
    }
    return this.prisma.$transaction(async (tx) => {
      // Lock the invoice row first so two concurrent payments can't both read
      // the same outstanding balance and overpay under Read Committed.
      await tx.$queryRaw`SELECT "id" FROM "Invoice" WHERE "id" = ${invoiceId} AND "firmId" = ${user.firmId} FOR UPDATE`;
      const invoice = await tx.invoice.findFirst({
        where: { id: invoiceId, firmId: user.firmId },
        include: { payments: true },
      });
      if (!invoice) throw new NotFoundException('Invoice not found');
      if (dto.templateId) await resolveTemplate(tx, user.firmId, 'RECEIPT', invoice.billToCustomerId, dto.templateId);
      if (dto.createRequestId) {
        const existing = await tx.invoicePayment.findUnique({ where: { firmId_createRequestId: { firmId: user.firmId, createRequestId: dto.createRequestId } }, include: { receipts: { where: { voidedAt: null } } } });
        if (existing) {
          if (existing.invoiceId !== invoiceId || existing.amount !== dto.amount || existing.receivedAt.toISOString().slice(0, 10) !== receivedAt.toISOString().slice(0, 10) || existing.method !== (dto.method ?? 'TRANSFER') || (existing.note ?? '') !== (dto.note ?? '') || existing.whtAmount !== whtAmount || existing.whtRate !== (dto.whtRate ?? null) || (existing.whtCertificateNo ?? '') !== (dto.whtCertificateNo ?? '')) {
            throw new ConflictException('รายการรับเงินนี้ถูกบันทึกไปแล้วด้วยข้อมูลอื่น ตรวจประวัติรับเงินก่อนบันทึกซ้ำ');
          }
          return { invoice, payment: existing, receipt: existing.receipts[0] ?? null, outstanding: round(invoice.totalAmount - settledAmount(invoice.payments)) };
        }
      }
      if (invoice.status === InvoiceStatus.DRAFT) {
        throw new BadRequestException('ต้องส่งใบแจ้งหนี้ก่อนบันทึกรับเงิน');
      }
      if (invoice.status === InvoiceStatus.PAID) {
        throw new BadRequestException('ใบแจ้งหนี้นี้ชำระครบแล้ว');
      }
      const paidSoFar = settledAmount(invoice.payments);
      const outstandingBefore = round(invoice.totalAmount - paidSoFar);
      if (round(dto.amount + whtAmount) > outstandingBefore) {
        throw new BadRequestException('ยอดรับรวมภาษีหัก ณ ที่จ่ายเกินยอดค้าง กรุณาลดยอด');
      }
      const payment = await tx.invoicePayment.create({
        data: {
          firmId: user.firmId,
          invoiceId,
          amount: dto.amount,
          whtAmount,
          whtRate: dto.whtRate,
          whtCertificateNo: dto.whtCertificateNo,
          clearedAt: dto.method === 'CHEQUE' ? null : receivedAt,
          method: dto.method,
          receivedAt,
          createRequestId: dto.createRequestId,
          note: dto.note,
          recordedById: user.id,
        },
      });
      const receipt = dto.method === 'CHEQUE' ? null : await issueReceipt(tx, user.firmId, invoice, payment, receivedAt, undefined, dto.templateId);
      const outstanding = round(outstandingBefore - (dto.method === 'CHEQUE' ? 0 : dto.amount + whtAmount));
      const updatedInvoice: Invoice =
        outstanding <= 0.005
          ? await tx.invoice.update({ where: { id: invoiceId, firmId: user.firmId }, data: { status: InvoiceStatus.PAID } })
          : invoice;
      return { invoice: updatedInvoice, payment, receipt, outstanding };
    }).catch(error => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('รายการรับเงินนี้ถูกบันทึกไปแล้ว ตรวจประวัติรับเงิน');
      throw error;
    });
  }

  async clearCheque(user: AuthUser, invoiceId: string, paymentId: string, dto: ClearChequeDto) {
    this.owner(user);
    const clearedAt = new Date(dto.clearedAt);
    if (Number.isNaN(clearedAt.getTime()) || bangkokDayKey(clearedAt) > bangkokDayKey(new Date())) {
      throw new BadRequestException('ระบุวันที่เช็คผ่านไม่เกินวันนี้');
    }
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "Invoice" WHERE "id" = ${invoiceId} AND "firmId" = ${user.firmId} FOR UPDATE`;
      const invoice = await tx.invoice.findFirst({ where: { id: invoiceId, firmId: user.firmId }, include: { payments: true } });
      if (!invoice) throw new NotFoundException('ไม่พบใบแจ้งหนี้');
      const payment = await tx.invoicePayment.findFirst({ where: { id: paymentId, invoiceId, firmId: user.firmId }, include: { receipts: { where: { voidedAt: null } } } });
      if (!payment) throw new NotFoundException('ไม่พบรายการรับเงิน');
      if (payment.method !== 'CHEQUE') throw new BadRequestException('เลือกรายการรับเงินด้วยเช็ค');
      if (clearedAt < payment.receivedAt) throw new BadRequestException('วันที่เช็คผ่านต้องไม่ก่อนวันที่รับเช็ค');
      const outstandingBefore = round(invoice.totalAmount - settledAmount(invoice.payments));
      if (dto.templateId) await resolveTemplate(tx, user.firmId, 'RECEIPT', invoice.billToCustomerId, dto.templateId);
      if (payment.clearedAt) {
        if (payment.clearedAt.getTime() !== clearedAt.getTime()) throw new ConflictException('เช็คผ่านแล้ว กรุณาใช้วันที่เดิม');
        return { payment, receipt: payment.receipts[0] ?? null, outstanding: outstandingBefore };
      }
      const settled = round(payment.amount + payment.whtAmount);
      if (settled > outstandingBefore) throw new BadRequestException('ยอดเช็ครวมภาษีเกินยอดค้าง กรุณาตรวจรายการรับเงิน');
      const updated = await tx.invoicePayment.update({ where: { id: paymentId, firmId: user.firmId, invoiceId }, data: { clearedAt } });
      const receipt = await issueReceipt(tx, user.firmId, invoice, updated, clearedAt, undefined, dto.templateId);
      const outstanding = round(outstandingBefore - settled);
      if (outstanding <= 0.005) await tx.invoice.update({ where: { id: invoiceId, firmId: user.firmId }, data: { status: InvoiceStatus.PAID } });
      return { payment: updated, receipt, outstanding };
    }).catch(error => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('เช็คนี้ออกใบเสร็จไปแล้ว โหลดหน้าใหม่');
      throw error;
    });
  }

  async listPayments(user: AuthUser, invoiceId: string): Promise<InvoicePayment[]> {
    this.owner(user);
    const invoice = await this.prisma.invoice.findFirst({ where: { id: invoiceId, firmId: user.firmId } });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return this.prisma.invoicePayment.findMany({ where: { invoiceId, firmId: user.firmId }, orderBy: { receivedAt: 'desc' } });
  }

  async getReceivables(user: AuthUser, today: Date = new Date(), caseFilter?: Prisma.CaseWhereInput) {
    this.owner(user);
    const invoices = await this.prisma.invoice.findMany({
      where: { firmId: user.firmId, status: InvoiceStatus.SENT, ...(caseFilter ? { case: caseFilter } : {}) },
      include: INVOICE_INCLUDE,
      orderBy: { dueAt: 'asc' },
    });

    const rows = invoices
      .map(invoice => this.row(invoice, today))
      .filter((row) => row.outstanding > 0.005);

    return { buckets: summarizeBuckets(rows), rows };
  }

  async sendReminder(
    user: AuthUser,
    invoiceId: string,
    now: Date = new Date(),
  ): Promise<{ sent: number; linkedContacts: number }> {
    this.owner(user);
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, firmId: user.firmId },
      include: { payments: true, case: { select: { clientId: true } } },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');

    const paidSoFar = settledAmount(invoice.payments);
    const outstanding = round(invoice.totalAmount - paidSoFar);
    if (invoice.status !== InvoiceStatus.SENT || outstanding <= 0.005) {
      throw new BadRequestException('ต้องส่งใบแจ้งหนี้และมียอดค้างชำระก่อนทวงได้');
    }
    if (invoice.lastReminderAt && now.getTime() - invoice.lastReminderAt.getTime() < 24 * 60 * 60 * 1000) {
      throw new BadRequestException('ทวงใบนี้ไปแล้วใน 24 ชั่วโมงที่ผ่านมา รอครบ 24 ชั่วโมงแล้วค่อยทวงอีกครั้ง');
    }

    const clientId = invoice.billToCustomerId ?? invoice.case?.clientId;
    const contacts = clientId
      ? await this.prisma.clientContact.findMany({
          where: { clientId, lineUserId: { not: null } },
        })
      : [];
    const enabledContacts: typeof contacts = [];
    for (const contact of contacts) {
      if (await this.contactPrefs.isChannelEnabled(contact.id, 'LINE')) {
        enabledContacts.push(contact);
      }
    }

    const text =
      `แจ้งเตือนยอดค้างชำระ\n` +
      `ใบแจ้งหนี้ ${invoice.invoiceNumber}\n` +
      `ยอดค้าง ${outstanding.toLocaleString('th-TH')} บาท\n` +
      `ครบกำหนด ${invoice.dueAt?.toLocaleDateString('th-TH') ?? '-'}\n` +
      `หากชำระแล้วขออภัยและขอบคุณครับ/ค่ะ`;

    let sent = 0;
    for (const contact of enabledContacts) {
      try {
        if (await this.lineMessaging.pushTo(contact.lineUserId!, text)) sent += 1;
      } catch (err) {
        this.logger.error(`Failed to send reminder to contact ${contact.id}`, err as Error);
      }
    }

    if (sent > 0) {
      await this.prisma.invoice.update({ where: { id: invoiceId }, data: { lastReminderAt: now } });
    }

    return { sent, linkedContacts: contacts.length };
  }
}
