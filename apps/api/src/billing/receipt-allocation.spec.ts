import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuthUser, FirmRole } from '@lawfirm/shared';
import { issueReceipt, ReceiptsService } from './receipts.service';

const user = { id: 'u1', firmId: 'f1', firmRole: FirmRole.OWNER } as AuthUser;
const day = new Date('2026-11-01');

describe('receipt allocation and reissue', () => {
  let db: any, invoice: any, payments: any[], receipts: any[], service: ReceiptsService;
  let lines: any[];
  beforeEach(() => {
    invoice = { id: 'i1', firmId: 'f1', totalAmount: 51400, vatAmount: 1400, vatRate: 0.07, discountAmount: 0 };
    lines = [{ amount: 30000, taxClass: 'LITIGATION_EXEMPT' }, { amount: 20000, taxClass: 'ADVISORY_VAT' }];
    payments = [
      { id: 'p1', firmId: 'f1', invoiceId: 'i1', amount: 25000, whtAmount: 729.57, method: 'TRANSFER', receivedAt: day, clearedAt: day, createdAt: new Date('2026-11-01T01:00:00Z') },
      { id: 'p2', firmId: 'f1', invoiceId: 'i1', amount: 25670.43, whtAmount: 0, method: 'CHEQUE', receivedAt: day, clearedAt: new Date('2026-11-02'), createdAt: new Date('2026-11-01T02:00:00Z') },
    ];
    receipts = [];
    const matches = (row: any, where: any) => Object.entries(where).every(([key, value]) => row[key] === value);
    let number = 0;
    db = {
      billingDocumentTemplate: { findFirst: jest.fn().mockResolvedValue(null) },
      firm: { findUnique: async () => ({ vatRegistered: true, legalName: 'Law', taxId: '1234567890123', taxBranch: '00000', billingAddress: 'Bangkok', logoKey: null }) },
      invoice: { findFirst: async ({ where }: any) => matches(invoice, where) ? invoice : null },
      invoiceLineItem: { findMany: async () => lines },
      invoicePayment: { findMany: async ({ where }: any) => payments.filter(p => p.invoiceId === where.invoiceId && p.clearedAt) },
      receipt: {
        findMany: async ({ where }: any) => receipts.filter(r => matches(r, where)),
        findFirst: async ({ where, include }: any) => {
          const r = receipts.find(r => matches(r, where));
          return r ? { ...r, ...(include ? { invoice: { ...invoice, lineItems: lines }, payment: payments.find(p => p.id === r.paymentId) } : {}) } : null;
        },
        create: async ({ data }: any) => {
          const r = { id: `r${receipts.length + 1}`, voidedAt: null, ...data };
          receipts.push(r); return r;
        },
        update: async ({ where, data }: any) => Object.assign(receipts.find(r => matches(r, where)), data),
      },
      $queryRaw: async () => [{ n: BigInt(++number) }],
    };
    db.$transaction = (fn: any) => fn(db);
    service = new ReceiptsService(db);
  });

  const issue = (db: any, invoice: any, payment: any) => issueReceipt(db, 'f1', invoice, payment, payment.clearedAt);

  it('allocates only each payment share including WHT, and the two receipts total the invoice', async () => {
    const first = await issue(db, invoice, payments[0]);
    const last = await issue(db, invoice, payments[1]);
    expect(first).toMatchObject({ amountExempt: 15017.25, amountTaxable: 10011.51, amountVat: 700.81, amountDisbursement: 0, amountReceived: 25000, amountWht: 729.57 });
    expect(last).toMatchObject({ amountExempt: 14982.75, amountTaxable: 9988.49, amountVat: 699.19, amountReceived: 25670.43, amountWht: 0 });
    expect(first.amountVat + last.amountVat).toBe(1400);
    // each receipt's parts add up to what that payment settled (no satang gap)
    for (const r of [first, last]) {
      expect(Math.round((r.amountExempt + r.amountTaxable + r.amountVat + r.amountDisbursement) * 100) / 100).toBe(Math.round((r.amountReceived + r.amountWht) * 100) / 100);
    }
  });

  it('gives the final receipt the rounding remainder and uses allocated VAT for its tax-invoice flag', async () => {
    Object.assign(invoice, { totalAmount: 1.02, vatAmount: 0.01 });
    lines = [{ amount: 0.87, taxClass: 'LITIGATION_EXEMPT' }, { amount: 0.14, taxClass: 'ADVISORY_VAT' }];
    payments.forEach(p => Object.assign(p, { amount: 0.51, whtAmount: 0 }));
    const first = await issue(db, invoice, payments[0]);
    const last = await issue(db, invoice, payments[1]);
    expect(first).toMatchObject({ amountVat: 0.01, isTaxInvoice: true });
    expect(last).toMatchObject({ amountVat: 0, isTaxInvoice: false });
    expect(first.amountVat + last.amountVat).toBe(0.01);
    expect(first.amountExempt + last.amountExempt).toBe(0.87);
    expect(first.amountTaxable + last.amountTaxable).toBe(0.14);
  });

  it('discounts fee classes proportionally and leaves disbursements undiscounted', async () => {
    Object.assign(invoice, { totalAmount: 51260, discountAmount: 5000, vatAmount: 1260 });
    lines.push({ amount: 5000, taxClass: 'DISBURSEMENT' });
    Object.assign(payments[0], { amount: 25630, whtAmount: 0 });
    expect(await issue(db, invoice, payments[0])).toMatchObject({ amountExempt: 13500, amountTaxable: 9000, amountVat: 630, amountDisbursement: 2500 });
  });

  it('prints frozen receipt totals even if invoice and payment values later change', async () => {
    const receipt = await issue(db, invoice, payments[0]);
    invoice.totalAmount = 999999; invoice.vatAmount = 999;
    payments[0].amount = 1; payments[0].whtAmount = 0;
    const printed = await service.print(user, receipt.id);
    expect(printed.totals).toMatchObject({ totalAmount: 25729.57, amountExempt: 15017.25, amountTaxable: 10011.51, amountVat: 700.81, vatAmount: 700.81, amountDisbursement: 0, amount: 25000, whtAmount: 729.57 });
    expect(printed.invoice.lineItems).toHaveLength(2);
  });

  it('reprints the balance as of that payment, unaffected by later payments or a voided earlier receipt', async () => {
    const first = await issue(db, invoice, payments[0]);
    const last = await issue(db, invoice, payments[1]);
    expect((await service.print(user, last.id)).outstandingAfter).toBe(0);
    expect((await service.print(user, first.id)).outstandingAfter).toBe(25670.43);
    await service.void(user, first.id, 'wrong');
    expect((await service.print(user, last.id)).outstandingAfter).toBe(0);
  });

  it.each([0, 1])('voids and reissues payment %s with a new number, original payment date and the same allocation', async index => {
    await issue(db, invoice, payments[0]);
    await issue(db, invoice, payments[1]);
    const original = { ...receipts[index] };
    await service.void(user, original.id, 'replace');
    const replacement = await service.reissue(user, original.id);
    expect(replacement.receiptNumber).not.toBe(original.receiptNumber);
    expect(replacement).toMatchObject({ replacesReceiptId: original.id, issuedAt: payments[index].clearedAt,
      amountExempt: original.amountExempt, amountTaxable: original.amountTaxable, amountVat: original.amountVat,
      amountDisbursement: original.amountDisbursement, amountReceived: original.amountReceived, amountWht: original.amountWht });
    expect(receipts.filter(r => !r.voidedAt).reduce((sum, r) => sum + r.amountVat, 0)).toBe(1400);
    await expect(service.reissue(user, original.id)).rejects.toThrow(BadRequestException);
  });

  it('refuses to reissue a receipt that has not been voided', async () => {
    const r = await issue(db, invoice, payments[0]);
    await expect(service.reissue(user, r.id)).rejects.toThrow(BadRequestException);
  });

  it('returns 404 when reissuing another firm receipt', async () => {
    const r = await issue(db, invoice, payments[0]);
    await service.void(user, r.id, 'replace');
    await expect(service.reissue({ ...user, firmId: 'other' }, r.id)).rejects.toThrow(NotFoundException);
  });

  it('rejects reissue without the manageInvoices capability', async () => {
    await expect(service.reissue({ ...user, firmRole: FirmRole.LAWYER }, 'r1')).rejects.toThrow(ForbiddenException);
  });
});
