import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { AuthUser } from '@lawfirm/shared';
import { InvoiceStatus, Invoice, InvoicePayment } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.module';
import { RecordPaymentDto } from './dto/billing.dto';
import { AgingBucket, agingBucket, daysOverdue, summarizeBuckets } from './receivables';

const round = (n: number) => Math.round(n * 100) / 100;
const DAY_MS = 86400000;

@Injectable()
export class CollectionsService {
  constructor(private prisma: PrismaService) {}

  async markSent(user: AuthUser, invoiceId: string): Promise<Invoice> {
    const invoice = await this.prisma.invoice.findFirst({ where: { id: invoiceId, firmId: user.firmId } });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status !== InvoiceStatus.DRAFT) {
      throw new BadRequestException('ส่งได้เฉพาะใบแจ้งหนี้ฉบับร่าง');
    }
    const issuedAt = new Date();
    const dueAt = invoice.dueAt ?? new Date(issuedAt.getTime() + 30 * DAY_MS);
    return this.prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: InvoiceStatus.SENT, issuedAt, dueAt },
    });
  }

  async recordPayment(
    user: AuthUser,
    invoiceId: string,
    dto: RecordPaymentDto,
  ): Promise<{ invoice: Invoice; payment: InvoicePayment; outstanding: number }> {
    return this.prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findFirst({
        where: { id: invoiceId, firmId: user.firmId },
        include: { payments: true },
      });
      if (!invoice) throw new NotFoundException('Invoice not found');
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
          receivedAt: new Date(dto.receivedAt),
          note: dto.note,
          recordedById: user.id,
        },
      });
      const outstanding = round(outstandingBefore - dto.amount);
      const updatedInvoice: Invoice =
        outstanding <= 0.005
          ? await tx.invoice.update({ where: { id: invoiceId }, data: { status: InvoiceStatus.PAID } })
          : invoice;
      return { invoice: updatedInvoice, payment, outstanding };
    });
  }

  async listPayments(user: AuthUser, invoiceId: string): Promise<InvoicePayment[]> {
    const invoice = await this.prisma.invoice.findFirst({ where: { id: invoiceId, firmId: user.firmId } });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return this.prisma.invoicePayment.findMany({ where: { invoiceId }, orderBy: { receivedAt: 'desc' } });
  }

  async getReceivables(user: AuthUser, today: Date = new Date()) {
    const invoices = await this.prisma.invoice.findMany({
      where: { firmId: user.firmId, status: { not: InvoiceStatus.DRAFT } },
      include: {
        payments: true,
        billToCustomer: { select: { name: true } },
        case: { select: { ownRef: true, client: { select: { name: true } } } },
      },
      orderBy: { dueAt: 'asc' },
    });

    const rows = invoices
      .map((invoice) => {
        const paidAmount = round(invoice.payments.reduce((sum, p) => sum + p.amount, 0));
        const outstanding = round(invoice.totalAmount - paidAmount);
        const days = daysOverdue(invoice.dueAt, today);
        const bucket: AgingBucket = agingBucket(days);
        return {
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          customerName: invoice.billToCustomer?.name ?? invoice.case?.client?.name ?? null,
          caseId: invoice.caseId,
          caseRef: invoice.case?.ownRef ?? null,
          totalAmount: invoice.totalAmount,
          paidAmount,
          outstanding,
          issuedAt: invoice.issuedAt?.toISOString() ?? null,
          dueAt: invoice.dueAt?.toISOString() ?? null,
          daysOverdue: days,
          bucket,
          lastReminderAt: invoice.lastReminderAt?.toISOString() ?? null,
        };
      })
      .filter((row) => row.outstanding > 0.005);

    return { buckets: summarizeBuckets(rows), rows };
  }
}
