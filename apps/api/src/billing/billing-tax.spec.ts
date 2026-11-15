import { BadRequestException } from '@nestjs/common';
import { BillingService } from './billing.service';
import { AuthUser } from '@lawfirm/shared';
const user = { id: 'u1', firmId: 'f1' } as AuthUser;
describe('invoice VAT', () => {
  let db: any, service: BillingService;
  beforeEach(() => {
    db = { firm: { findUnique: jest.fn().mockResolvedValue({ vatRegistered: true }) },
      invoice: { create: jest.fn(async ({ data }) => data), findFirst: jest.fn(), updateMany: jest.fn(async ({ data }) => { db.changed = data; return { count: 1 }; }) },
      case: { findFirst: jest.fn().mockResolvedValue(null) }, intake: { findFirst: jest.fn().mockResolvedValue(null) },
      auditLog: { create: jest.fn() }, $queryRaw: jest.fn().mockResolvedValue([{ n: BigInt(1) }]),
    };
    db.$transaction = (fn: any) => fn(db);
    service = new BillingService(db, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
  });
  const lines = [
    { description: 'litigation', quantity: 1, unitPrice: 10000, taxClass: 'LITIGATION_EXEMPT' },
    { description: 'advisory', quantity: 1, unitPrice: 20000, taxClass: 'ADVISORY_VAT' },
    { description: 'disbursement', quantity: 1, unitPrice: 5000, taxClass: 'DISBURSEMENT' },
  ];
  it('taxes only advisory net of the proportional fee discount', async () => {
    const [invoice] = await (service as any).createInvoice(user, {}, { lineItems: lines, discountAmount: 3000, discountReason: 'discount' } as any);
    expect(invoice.vatAmount).toBe(1260); expect(invoice.totalAmount).toBe(33260);
    expect(invoice.lineItems.create[2].taxClass).toBe('DISBURSEMENT');
  });
  it('does not tax an unregistered firm', async () => {
    db.firm.findUnique.mockResolvedValue({ vatRegistered: false });
    const [invoice] = await (service as any).createInvoice(user, {}, { lineItems: lines } as any);
    expect(invoice.vatAmount).toBe(0); expect(invoice.totalAmount).toBe(35000);
  });
  it.each([
    [{ name: 'Company', type: 'COMPANY' }, { client: { type: 'INDIVIDUAL' } }, 'COMPANY'],
    [null, { client: { type: 'INDIVIDUAL' } }, 'INDIVIDUAL'],
    [null, null, null],
  ])('includes issuedAt and the billed client type in invoice search rows', async (billToCustomer, legalCase, clientType) => {
    const issuedAt = new Date('2026-11-01');
    db.invoice.findMany = jest.fn().mockResolvedValue([{ id: 'i1', issuedAt, totalAmount: 100, payments: [], billToCustomer, case: legalCase }]);
    service = new BillingService(db, {} as any, {} as any, { getCaseFilterForFinancials: () => ({ firmId: 'f1' }) } as any, {} as any, {} as any, {} as any);
    expect(await service.getFirmInvoices(user)).toEqual([expect.objectContaining({ issuedAt, clientType })]);
  });
  it('rejects a case in another firm before reading its time or expenses', async () => {
    await expect(service.createInvoice(user, { caseId: 'foreign' }, { lineItems: lines } as any)).rejects.toThrow('ไม่พบคดี');
    expect(db.case.findFirst).toHaveBeenCalledWith({ where: { id: 'foreign', firmId: 'f1' }, select: { id: true } });
  });
  it('recomputes VAT at the invoice stored rate on discount changes, without discounting disbursements', async () => {
    db.invoice.findFirst.mockResolvedValue({ id: 'i1', status: 'DRAFT', vatRate: 0.1, discountAmount: 0, lineItems: lines.map(l => ({ amount: l.unitPrice, taxClass: l.taxClass })) });
    await service.setInvoiceDiscount(user, 'i1', { discountAmount: 3000, discountReason: 'discount' });
    expect(db.changed).toMatchObject({ vatAmount: 1800, totalAmount: 33800 });
    await expect(service.setInvoiceDiscount(user, 'i1', { discountAmount: 31000, discountReason: 'discount' })).rejects.toThrow(BadRequestException);
  });
});
