import { NotFoundException, BadRequestException } from '@nestjs/common';
import { AuthUser, FirmRole } from '@lawfirm/shared';
const user = { id: 'u1', firmId: 'f1', firmRole: FirmRole.OWNER } as AuthUser;
describe('receipt documents', () => {
  let service: any, db: any;
  beforeEach(() => {
    db = { receipt: { findFirst: jest.fn().mockResolvedValue({ id: 'r1', receiptNumber: 'RC-2026-0001', voidedAt: null }),
      update: jest.fn(async ({ data }) => ({ id: 'r1', receiptNumber: 'RC-2026-0001', ...data })), findMany: jest.fn().mockResolvedValue([]) } };
    const { ReceiptsService } = require('./receipts.service');
    service = new ReceiptsService(db);
  });
  it('void preserves its number and requires a reason', async () => {
    const result = await service.void(user, 'r1', 'duplicate');
    expect(result).toMatchObject({ receiptNumber: 'RC-2026-0001', voidReason: 'duplicate', voidedById: 'u1', voidedAt: expect.any(Date) });
    await expect(service.void(user, 'r1', ' ')).rejects.toThrow(BadRequestException);
  });
  it('print includes frozen firm data, tax-class lines and payment totals', async () => {
    db.receipt.findFirst.mockResolvedValue({ id: 'r1', receiptNumber: 'RC-2026-0001', firmSnapshot: { legalName: 'Old firm' },
      amountReceived: 97000, amountWht: 3000, amountExempt: 100000, amountTaxable: 0, amountVat: 0, amountDisbursement: 0,
      payment: { amount: 97000, whtAmount: 3000 },
      invoice: { totalAmount: 100000, vatAmount: 0, vatRate: 0.07, discountAmount: 0,
        lineItems: [{ amount: 100000, taxClass: 'LITIGATION_EXEMPT' }], billToCustomer: { name: 'Client' } } });
    const result = await service.print(user, 'r1');
    expect(result).toMatchObject({ firmSnapshot: { legalName: 'Old firm' },
      amountReceived: 97000, amountWht: 3000, amountExempt: 100000, amountTaxable: 0, amountVat: 0, amountDisbursement: 0, customer: { name: 'Client' },
      invoice: { lineItems: [{ taxClass: 'LITIGATION_EXEMPT' }] }, totals: { totalAmount: 100000, amount: 97000, whtAmount: 3000 } });
  });
  it('marks a receipt sent and refuses to send a voided receipt', async () => {
    expect((await service.sent(user, 'r1')).sentAt).toBeInstanceOf(Date);
    db.receipt.findFirst.mockResolvedValue({ id: 'r1', voidedAt: new Date() });
    await expect(service.sent(user, 'r1')).rejects.toThrow(BadRequestException);
  });
  it.each(['unsent', 'sent', 'voided'])('lists only the firm and requested status %s', async status => {
    await service.list(user, status);
    expect(db.receipt.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ firmId: 'f1',
      voidedAt: status === 'voided' ? { not: null } : null,
      ...(status === 'voided' ? {} : { sentAt: status === 'sent' ? { not: null } : null }),
    }) }));
  });
  it('cross-firm print returns 404', async () => {
    db.receipt.findFirst.mockResolvedValue(null);
    await expect(service.print(user, 'foreign')).rejects.toThrow(NotFoundException);
    expect(db.receipt.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'foreign', firmId: 'f1' } }));
  });
  it('list rejects invalid status rather than returning another scope', async () => {
    await expect(service.list(user, 'invalid')).rejects.toThrow(BadRequestException);
  });
});
