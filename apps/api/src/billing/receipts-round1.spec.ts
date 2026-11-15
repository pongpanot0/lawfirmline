import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AuthUser, FirmRole } from '@lawfirm/shared';
import { CollectionsService } from './collections.service';

const user = { id: 'u1', firmId: 'f1', firmRole: FirmRole.OWNER } as AuthUser;
const day = new Date('2026-11-01');
describe('round 1 payment receipts', () => {
  let db: any, service: CollectionsService;
  beforeEach(() => {
    const invoice = { id: 'i1', firmId: 'f1', status: 'SENT', totalAmount: 100000, vatAmount: 0, discountAmount: 0, payments: [] };
    db = {
      invoice: { findFirst: jest.fn().mockResolvedValue(invoice), update: jest.fn(async ({ data }) => ({ ...invoice, ...data })) },
      invoicePayment: {
        create: jest.fn(async ({ data }) => ({ id: 'p1', whtAmount: 0, ...data })),
        findUnique: jest.fn().mockResolvedValue(null), findFirst: jest.fn(),
        update: jest.fn(async ({ data }) => ({ id: 'p1', whtAmount: 0, ...data })),
      },
      firm: { findUnique: jest.fn().mockResolvedValue({ legalName: 'Law', taxId: '1234567890123', taxBranch: '00000', billingAddress: 'Bangkok', vatRegistered: false, logoKey: null }) },
      invoiceLineItem: { findMany: jest.fn().mockResolvedValue([{ amount: 100000, taxClass: 'LITIGATION_EXEMPT' }]) },
      receipt: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn(async ({ data }) => ({ id: 'r1', ...data })), findFirst: jest.fn().mockResolvedValue(null) },
      $queryRaw: jest.fn().mockResolvedValue([{ n: BigInt(12) }]),
    };
    db.$transaction = (fn: any) => fn(db);
    service = new CollectionsService(db, {} as any, {} as any);
  });
  it('auto issues a frozen receipt with Gregorian numbering in the payment transaction', async () => {
    const result = await service.recordPayment(user, 'i1', { amount: 100, receivedAt: '2026-11-01' });
    expect((result as any).receipt).toMatchObject({ receiptNumber: 'RC-2026-0012', issuedAt: day, isTaxInvoice: false, templateVersion: 'standard-v1', firmSnapshot: { legalName: 'Law', address: 'Bangkok' } });
    expect(db.receipt.create).toHaveBeenCalledTimes(1);
  });
  it.each([[true, 700, true], [true, 0, false], [false, 700, false]])('isTaxInvoice uses the issue-time registration and VAT: %s/%s', async (registered, vatAmount, expected) => {
    db.firm.findUnique.mockResolvedValue({ vatRegistered: registered, legalName: null, taxId: null, taxBranch: null, billingAddress: null, logoKey: null });
    db.invoice.findFirst.mockResolvedValue({ id: 'i1', firmId: 'f1', status: 'SENT', totalAmount: 100000, vatAmount, discountAmount: 0, payments: [] });
    const result = await service.recordPayment(user, 'i1', { amount: 100, receivedAt: '2026-11-01' });
    expect(result.receipt?.isTaxInvoice).toBe(expected);
  });
  it('WHT settles the whole fee and flips PAID', async () => {
    const result = await service.recordPayment(user, 'i1', { amount: 97000, whtAmount: 3000, whtRate: 0.03, receivedAt: '2026-11-01' } as any);
    expect(result.outstanding).toBe(0); expect(result.invoice.status).toBe('PAID');
  });
  it('rejects amount plus WHT above outstanding', async () => {
    await expect(service.recordPayment(user, 'i1', { amount: 98000, whtAmount: 3000, receivedAt: '2026-11-01' } as any)).rejects.toThrow(BadRequestException);
  });
  it('pending cheque leaves outstanding and only clearing issues a receipt dated clearedAt', async () => {
    const pending = await service.recordPayment(user, 'i1', { amount: 97000, whtAmount: 3000, method: 'CHEQUE', receivedAt: '2026-11-01' } as any);
    expect(pending.outstanding).toBe(100000); expect((pending as any).receipt).toBeNull();
    expect((pending.payment as any).clearedAt).toBeNull(); expect(db.receipt.create).not.toHaveBeenCalled();
    db.invoicePayment.findFirst.mockResolvedValue({ ...pending.payment, receipts: [] });
    const cleared = await (service as any).clearCheque(user, 'i1', 'p1', { clearedAt: '2026-11-02' });
    expect(cleared.receipt.issuedAt).toEqual(new Date('2026-11-02')); expect(cleared.outstanding).toBe(0);
    expect(db.receipt.create).toHaveBeenCalledTimes(1);
  });
  it('does not allow clearing after another payment already settled the balance', async () => {
    db.invoice.findFirst.mockResolvedValue({ id: 'i1', status: 'PAID', totalAmount: 100000, payments: [{ amount: 100000, whtAmount: 0, clearedAt: day }] });
    db.invoicePayment.findFirst.mockResolvedValue({ id: 'p1', method: 'CHEQUE', amount: 100, whtAmount: 0, receivedAt: day, clearedAt: null });
    await expect((service as any).clearCheque(user, 'i1', 'p1', { clearedAt: '2026-11-02' })).rejects.toThrow(BadRequestException);
  });
  it.each(['2026-10-31', '2099-01-01'])('rejects an invalid clearing date %s', async (clearedAt) => {
    db.invoicePayment.findFirst.mockResolvedValue({ id: 'p1', method: 'CHEQUE', amount: 100, whtAmount: 0, receivedAt: day, clearedAt: null });
    await expect((service as any).clearCheque(user, 'i1', 'p1', { clearedAt })).rejects.toThrow(BadRequestException);
  });
  it('idempotency rejects changed WHT fields and returns the original receipt', async () => {
    const existing = { id: 'p1', invoiceId: 'i1', amount: 97000, whtAmount: 3000, whtRate: 0.03, whtCertificateNo: 'cert', receivedAt: day, method: 'TRANSFER', note: null, receipts: [{ id: 'r1' }] };
    db.invoicePayment.findUnique.mockResolvedValue(existing);
    await expect(service.recordPayment(user, 'i1', { amount: 97000, whtAmount: 2000, receivedAt: '2026-11-01', createRequestId: 'req' } as any)).rejects.toThrow(ConflictException);
    const result = await service.recordPayment(user, 'i1', { amount: 97000, whtAmount: 3000, whtRate: 0.03, whtCertificateNo: 'cert', receivedAt: '2026-11-01', createRequestId: 'req' } as any);
    expect((result as any).receipt.id).toBe('r1'); expect(db.invoicePayment.create).not.toHaveBeenCalled();
  });
  it('cross-firm payment cannot be cleared through an owned invoice', async () => {
    db.invoicePayment.findFirst.mockResolvedValue(null);
    await expect(service.clearCheque(user, 'i1', 'foreign', { clearedAt: '2026-11-02' })).rejects.toThrow(NotFoundException);
    expect(db.invoicePayment.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'foreign', invoiceId: 'i1', firmId: 'f1' } }));
  });
  it('cross-firm invoice access returns 404', async () => {
    db.invoice.findFirst.mockResolvedValue(null);
    await expect(service.recordPayment(user, 'foreign', { amount: 1, receivedAt: '2026-11-01' })).rejects.toThrow(NotFoundException);
    expect(db.invoice.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'foreign', firmId: 'f1' } }));
  });
});
