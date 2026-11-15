import { resolveTemplate } from '../document-templates/document-templates.service';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser, hasFirmCapability } from '@lawfirm/shared';
import { Invoice, InvoicePayment, Prisma } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.module';

const round = (n: number) => Math.round(n * 100) / 100;

// Callers hold the invoice row lock so allocations and reissues are serialized.
export async function issueReceipt(tx: Prisma.TransactionClient, firmId: string, invoice: Invoice, payment: InvoicePayment, issuedAt: Date, replacesReceiptId?: string, templateId?: string) {
  const firm = await tx.firm.findUnique({ where: { id: firmId } });
  if (!firm) throw new NotFoundException('ไม่พบสำนักงาน');
  const templateSnapshot = await resolveTemplate(tx, firmId, 'RECEIPT', invoice.billToCustomerId, templateId);
  const lines = await tx.invoiceLineItem.findMany({ where: { invoiceId: invoice.id }, select: { amount: true, taxClass: true } });
  const active = await tx.receipt.findMany({ where: { invoiceId: invoice.id, firmId, voidedAt: null } });
  const fees = lines.filter(l => l.taxClass !== 'DISBURSEMENT').reduce((sum, l) => sum + l.amount, 0);
  const advisory = lines.filter(l => l.taxClass === 'ADVISORY_VAT').reduce((sum, l) => sum + l.amount, 0);
  const taxable = fees > 0 ? round(advisory * (1 - invoice.discountAmount / fees)) : 0;
  const components = {
    amountExempt: round(fees - invoice.discountAmount - taxable), amountTaxable: taxable,
    amountVat: invoice.vatAmount,
    amountDisbursement: round(lines.filter(l => l.taxClass === 'DISBURSEMENT').reduce((sum, l) => sum + l.amount, 0)),
  };
  const grossSettled = round(payment.amount + payment.whtAmount);
  const share = grossSettled / invoice.totalAmount;
  const last = round(active.reduce((sum, r) => sum + r.amountReceived + r.amountWht, 0) + grossSettled) >= invoice.totalAmount;
  const allocate = (key: keyof typeof components) => round(last
    ? components[key] - active.reduce((sum, r) => sum + r[key], 0)
    : components[key] * share);
  const allocation = { amountExempt: allocate('amountExempt'), amountTaxable: allocate('amountTaxable'),
    amountVat: allocate('amountVat'), amountDisbursement: allocate('amountDisbursement') };
  // Rounding each part separately can leave a satang gap; the receipt's parts must add up to what was settled.
  const gap = round(grossSettled - (allocation.amountExempt + allocation.amountTaxable + allocation.amountVat + allocation.amountDisbursement));
  if (gap !== 0) {
    const largest = (Object.keys(allocation) as (keyof typeof allocation)[]).reduce((a, b) => (allocation[b] > allocation[a] ? b : a));
    allocation[largest] = round(allocation[largest] + gap);
  }
  const [row] = await tx.$queryRaw<{ n: bigint }[]>`SELECT nextval('receipt_number_seq') AS n`;
  return tx.receipt.create({ data: {
    firmId, invoiceId: invoice.id, paymentId: payment.id,
    replacesReceiptId, ...allocation, amountReceived: payment.amount, amountWht: payment.whtAmount,
    receiptNumber: `RC-${issuedAt.getUTCFullYear()}-${String(row.n).padStart(4, '0')}`,
    issuedAt, isTaxInvoice: firm.vatRegistered && allocation.amountVat > 0,
    firmSnapshot: { legalName: firm.legalName, taxId: firm.taxId, taxBranch: firm.taxBranch,
      address: firm.billingAddress, vatRegistered: firm.vatRegistered, logoKey: firm.logoKey },
    templateSnapshot: templateSnapshot as unknown as Prisma.InputJsonValue,
    templateVersion: templateSnapshot.templateId ? `${templateSnapshot.templateId}:v${templateSnapshot.version}` : 'standard-v1',
  } });
}

@Injectable()
export class ReceiptsService {
  constructor(private prisma: PrismaService) {}

  private authorize(user: AuthUser) {
    if (!hasFirmCapability(user.firmRole, 'manageInvoices')) throw new ForbiddenException('ไม่มีสิทธิ์จัดการใบเสร็จ');
  }

  async list(user: AuthUser, status?: string) {
    this.authorize(user);
    if (status && !['unsent', 'sent', 'voided'].includes(status)) throw new BadRequestException('เลือกสถานะ unsent, sent หรือ voided');
    const receipts = await this.prisma.receipt.findMany({
      where: { firmId: user.firmId, ...(status === 'voided' ? { voidedAt: { not: null } }
        : status ? { voidedAt: null, sentAt: status === 'sent' ? { not: null } : null } : {}) },
      include: { payment: true, invoice: { select: { invoiceNumber: true, billToCustomer: { select: { name: true } },
        case: { select: { clientName: true, client: { select: { name: true } } } }, intake: { select: { clientName: true } } } } },
      orderBy: [{ issuedAt: 'desc' }, { createdAt: 'desc' }],
    });
    return receipts.map(r => ({ ...r, invoiceNumber: r.invoice.invoiceNumber,
      customerName: r.invoice.billToCustomer?.name ?? r.invoice.case?.client?.name ?? r.invoice.case?.clientName ?? r.invoice.intake?.clientName ?? null,
      amount: r.amountReceived, whtAmount: r.amountWht }));
  }

  async print(user: AuthUser, id: string) {
    this.authorize(user);
    const receipt = await this.prisma.receipt.findFirst({ where: { id, firmId: user.firmId },
      include: { payment: true, invoice: { include: { lineItems: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] },
        billToCustomer: { select: { id: true, name: true, taxId: true, branch: true, address: true, billingEmail: true, billingPhone: true } },
        case: { select: { ownRef: true, title: true } }, intake: { select: { title: true } } } } } });
    if (!receipt) throw new NotFoundException('ไม่พบใบเสร็จ');
    // Balance as of this receipt's payment (from cleared payments, so voided receipts don't inflate it
    // and later payments don't change a reprint).
    const payments = await this.prisma.invoicePayment.findMany({
      where: { invoiceId: receipt.invoiceId, firmId: user.firmId, clearedAt: { not: null } },
      select: { amount: true, whtAmount: true, clearedAt: true, createdAt: true },
    });
    const mine = receipt.payment;
    const settledUpTo = payments
      .filter(p => p.clearedAt! < mine.clearedAt! || (p.clearedAt!.getTime() === mine.clearedAt!.getTime() && p.createdAt <= mine.createdAt))
      .reduce((sum, p) => sum + p.amount + p.whtAmount, 0);
    const outstandingAfter = Math.max(0, round(receipt.invoice.totalAmount - settledUpTo));
    return { ...receipt, customer: receipt.invoice.billToCustomer, outstandingAfter,
      totals: { totalAmount: round(receipt.amountReceived + receipt.amountWht), discountAmount: receipt.invoice.discountAmount,
        amountExempt: receipt.amountExempt, amountTaxable: receipt.amountTaxable,
        amountVat: receipt.amountVat, amountDisbursement: receipt.amountDisbursement,
        amountReceived: receipt.amountReceived, amountWht: receipt.amountWht,
        vatAmount: receipt.amountVat, vatRate: receipt.invoice.vatRate,
        amount: receipt.amountReceived, whtAmount: receipt.amountWht } };
  }

  async reissue(user: AuthUser, id: string, templateId?: string) {
    this.authorize(user);
    return this.prisma.$transaction(async tx => {
      const original = await tx.receipt.findFirst({ where: { id, firmId: user.firmId } });
      if (!original) throw new NotFoundException('ไม่พบใบเสร็จ');
      await tx.$queryRaw`SELECT "id" FROM "Invoice" WHERE "id" = ${original.invoiceId} AND "firmId" = ${user.firmId} FOR UPDATE`;
      const receipt = await tx.receipt.findFirst({ where: { id, firmId: user.firmId }, include: { invoice: true, payment: true } });
      if (!receipt) throw new NotFoundException('ไม่พบใบเสร็จ');
      if (!receipt.voidedAt) throw new BadRequestException('ออกใหม่ได้เฉพาะใบเสร็จที่ยกเลิกแล้ว');
      const active = await tx.receipt.findFirst({ where: { paymentId: receipt.paymentId, firmId: user.firmId, voidedAt: null } });
      if (active) throw new BadRequestException('รายการรับเงินนี้มีใบเสร็จที่ยังไม่ยกเลิกแล้ว');
      if (!receipt.payment.clearedAt) throw new BadRequestException('รายการรับเงินยังไม่เคลียร์');
      const issuedAt = receipt.payment.method === 'CHEQUE' ? receipt.payment.clearedAt : receipt.payment.receivedAt;
      return issueReceipt(tx, user.firmId, receipt.invoice, receipt.payment, issuedAt, receipt.id, templateId);
    }).catch(error => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('รายการรับเงินนี้มีใบเสร็จที่ยังไม่ยกเลิกแล้ว โหลดหน้าใหม่');
      throw error;
    });
  }

  async sent(user: AuthUser, id: string) {
    this.authorize(user);
    const receipt = await this.prisma.receipt.findFirst({ where: { id, firmId: user.firmId } });
    if (!receipt) throw new NotFoundException('ไม่พบใบเสร็จ');
    if (receipt.voidedAt) throw new BadRequestException('ใบเสร็จถูกยกเลิกแล้ว กรุณาเลือกใบอื่น');
    return this.prisma.receipt.update({ where: { id, firmId: user.firmId, voidedAt: null }, data: { sentAt: receipt.sentAt ?? new Date() } });
  }

  async void(user: AuthUser, id: string, reason: string) {
    this.authorize(user);
    if (!reason?.trim() || reason.trim().length > 500) throw new BadRequestException('ระบุเหตุผลยกเลิกไม่เกิน 500 ตัวอักษร');
    const receipt = await this.prisma.receipt.findFirst({ where: { id, firmId: user.firmId } });
    if (!receipt) throw new NotFoundException('ไม่พบใบเสร็จ');
    if (receipt.voidedAt) return receipt;
    return this.prisma.receipt.update({ where: { id, firmId: user.firmId, voidedAt: null },
      data: { voidedAt: new Date(), voidReason: reason.trim(), voidedById: user.id } });
  }
}
