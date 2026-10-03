import { Injectable, Logger, BadRequestException, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { AuthUser, FirmRole } from '@lawfirm/shared';
import { InvoiceStatus, Invoice, InvoicePayment, Prisma } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.module';
import { CollectionFollowUpDto, RecordPaymentDto } from './dto/billing.dto';
import { agingBucket, daysOverdue, summarizeBuckets } from './receivables';
import { LineMessagingService } from '../notifications/line-messaging.service';
import { ContactNotificationPreferenceService } from '../notifications/contact-notification-preference.service';
import { bangkokMonthOf, monthRange } from '../operations/owner-kpis';
import { bangkokDayKey } from '../common/utils/bangkok-time';

const round = (n: number) => Math.round(n * 100) / 100;
const DAY_MS = 86400000;
const INVOICE_INCLUDE = {
  payments: true,
  billToCustomer: { select: { name: true } },
  intake: { select: { title: true, clientName: true } },
  case: { select: { ownRef: true, title: true, clientName: true, client: { select: { name: true } } } },
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
    if (user.firmRole !== FirmRole.OWNER) throw new ForbiddenException('Owner access required');
  }

  private row(invoice: Prisma.InvoiceGetPayload<{ include: typeof INVOICE_INCLUDE }>, today: Date) {
    const paidAmount = round(invoice.payments.reduce((sum, p) => sum + p.amount, 0));
    const days = daysOverdue(invoice.dueAt, today);
    return {
      id: invoice.id, invoiceNumber: invoice.invoiceNumber, status: invoice.status,
      customerName: invoice.billToCustomer?.name ?? invoice.case?.client?.name ?? invoice.case?.clientName ?? invoice.intake?.clientName ?? null,
      caseId: invoice.caseId, caseRef: invoice.case?.ownRef ?? null,
      subject: invoice.case?.title ?? invoice.intake?.title ?? 'ใบแจ้งหนี้สำนักงาน',
      totalAmount: invoice.totalAmount, paidAmount, outstanding: round(invoice.totalAmount - paidAmount),
      issuedAt: invoice.issuedAt?.toISOString() ?? null, dueAt: invoice.dueAt?.toISOString() ?? null,
      daysOverdue: days, bucket: agingBucket(days), lastReminderAt: invoice.lastReminderAt?.toISOString() ?? null,
      collectionOwner: invoice.collectionOwner ?? null,
      collectionNextAt: invoice.collectionNextAt?.toISOString().slice(0, 10) ?? null,
      collectionNote: invoice.collectionNote ?? null, updatedAt: invoice.updatedAt?.toISOString() ?? null,
    };
  }

  async getInvoice(user: AuthUser, invoiceId: string) {
    this.owner(user);
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, firmId: user.firmId }, include: { ...INVOICE_INCLUDE, lineItems: true },
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
      this.prisma.invoicePayment.findMany({ where: { firmId: user.firmId, receivedAt: { gte: start, lt: end } },
        include: { invoice: { select: { invoiceNumber: true } } }, orderBy: [{ receivedAt: 'desc' }, { id: 'asc' }] }),
      this.prisma.timeEntry.findMany({ where: { billable: true, invoiceId: null, case: { firmId: user.firmId, deletedAt: null } },
        include: { case: { select: caseSelect } }, orderBy: { date: 'asc' } }),
      this.prisma.expense.findMany({ where: { billable: true, invoiceId: null, status: { in: ['APPROVED', 'PAID'] }, case: { firmId: user.firmId, deletedAt: null } },
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
      totals: { received: round(payments.reduce((sum, payment) => sum + payment.amount, 0)),
        billed: round(billed.reduce((sum, row) => sum + row.totalAmount, 0)),
        unbilled: round(unbilled.reduce((sum, group) => sum + group.amount, 0) + drafts.reduce((sum, row) => sum + row.totalAmount, 0)),
        payable: round(payable.reduce((sum, expense) => sum + expense.amount, 0)),
        receivable: round(receivables.reduce((sum, row) => sum + row.outstanding, 0)) },
      receivables, unbilled, billed, payable, receipts: payments, drafts,
    };
  }

  async setFollowUp(user: AuthUser, invoiceId: string, dto: CollectionFollowUpDto) {
    this.owner(user);
    if (dto.ownerId && !await this.prisma.firmMember.findUnique({ where: { firmId_userId: { firmId: user.firmId, userId: dto.ownerId } } })) {
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

  async markSent(user: AuthUser, invoiceId: string): Promise<Invoice> {
    this.owner(user);
    const invoice = await this.prisma.invoice.findFirst({ where: { id: invoiceId, firmId: user.firmId } });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status !== InvoiceStatus.DRAFT) {
      throw new BadRequestException('ส่งได้เฉพาะใบแจ้งหนี้ฉบับร่าง');
    }
    const issuedAt = new Date();
    const dueAt = invoice.dueAt ?? new Date(issuedAt.getTime() + 30 * DAY_MS);
    return this.prisma.invoice.update({
      where: { id: invoiceId, firmId: user.firmId, status: InvoiceStatus.DRAFT },
      data: { status: InvoiceStatus.SENT, issuedAt, dueAt },
    }).catch(error => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') throw new ConflictException('สถานะใบแจ้งหนี้เปลี่ยนแล้ว กรุณาโหลดล่าสุด');
      throw error;
    });
  }

  async recordPayment(
    user: AuthUser,
    invoiceId: string,
    dto: RecordPaymentDto,
  ): Promise<{ invoice: Invoice; payment: InvoicePayment; outstanding: number }> {
    this.owner(user);
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
      if (dto.createRequestId) {
        const existing = await tx.invoicePayment.findUnique({ where: { firmId_createRequestId: { firmId: user.firmId, createRequestId: dto.createRequestId } } });
        if (existing) {
          if (existing.invoiceId !== invoiceId || existing.amount !== dto.amount || existing.receivedAt.toISOString().slice(0, 10) !== receivedAt.toISOString().slice(0, 10) || existing.method !== (dto.method ?? 'TRANSFER') || (existing.note ?? '') !== (dto.note ?? '')) {
            throw new ConflictException('คีย์รับเงินนี้ใช้แล้วกับข้อมูลอื่น กรุณาตรวจประวัติรับเงิน');
          }
          return { invoice, payment: existing, outstanding: round(invoice.totalAmount - invoice.payments.reduce((sum, payment) => sum + payment.amount, 0)) };
        }
      }
      if (invoice.status === InvoiceStatus.DRAFT) {
        throw new BadRequestException('ต้องส่งใบแจ้งหนี้ก่อนบันทึกรับเงิน');
      }
      if (invoice.status === InvoiceStatus.PAID) {
        throw new BadRequestException('ใบแจ้งหนี้นี้ชำระครบแล้ว');
      }
      const paidSoFar = invoice.payments.reduce((sum, p) => sum + p.amount, 0);
      const outstandingBefore = round(invoice.totalAmount - paidSoFar);
      if (dto.amount > outstandingBefore + 0.005) {
        throw new BadRequestException('ยอดรับเกินยอดค้าง');
      }
      const payment = await tx.invoicePayment.create({
        data: {
          firmId: user.firmId,
          invoiceId,
          amount: dto.amount,
          method: dto.method,
          receivedAt,
          createRequestId: dto.createRequestId,
          note: dto.note,
          recordedById: user.id,
        },
      });
      const outstanding = round(outstandingBefore - dto.amount);
      // Not flipping to PAID: `invoice` here is the pre-payment row (its
      // `.payments` doesn't include the one just created). Callers wanting
      // the new payment already get it back separately as `payment`.
      const updatedInvoice: Invoice =
        outstanding <= 0.005
          ? await tx.invoice.update({ where: { id: invoiceId }, data: { status: InvoiceStatus.PAID } })
          : invoice;
      return { invoice: updatedInvoice, payment, outstanding };
    }).catch(error => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('คีย์รับเงินนี้ใช้แล้ว กรุณาตรวจประวัติรับเงิน');
      throw error;
    });
  }

  async listPayments(user: AuthUser, invoiceId: string): Promise<InvoicePayment[]> {
    this.owner(user);
    const invoice = await this.prisma.invoice.findFirst({ where: { id: invoiceId, firmId: user.firmId } });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return this.prisma.invoicePayment.findMany({ where: { invoiceId }, orderBy: { receivedAt: 'desc' } });
  }

  async getReceivables(user: AuthUser, today: Date = new Date()) {
    this.owner(user);
    const invoices = await this.prisma.invoice.findMany({
      where: { firmId: user.firmId, status: InvoiceStatus.SENT },
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

    const paidSoFar = invoice.payments.reduce((sum, p) => sum + p.amount, 0);
    const outstanding = round(invoice.totalAmount - paidSoFar);
    if (invoice.status !== InvoiceStatus.SENT || outstanding <= 0.005) {
      throw new BadRequestException('ต้องส่งใบแจ้งหนี้และมียอดค้างชำระก่อนทวงได้');
    }
    if (invoice.lastReminderAt && now.getTime() - invoice.lastReminderAt.getTime() < 24 * 60 * 60 * 1000) {
      throw new BadRequestException('ทวงใบนี้ไปแล้วภายใน 24 ชม.');
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
