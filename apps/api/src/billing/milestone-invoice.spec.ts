import { BadRequestException, ConflictException } from '@nestjs/common';
import { AuthUser, FirmRole } from '@lawfirm/shared';
import { BillingService } from './billing.service';

const user = { id: 'u', firmId: 'f', firmRole: FirmRole.OWNER } as AuthUser;

describe('invoice milestone lines', () => {
  let db: any, service: BillingService, rows: any[];
  beforeEach(() => {
    rows = [{ id: 'm', caseId: 'c', firmId: 'f', status: 'PARTIAL', invoiceId: null, label: 'ค่าทนายงวดแรก', amount: 1000, closeAmount: 250.25, caseFee: { feeTaxClass: 'ADVISORY_VAT' } }];
    db = {
      $queryRaw: jest.fn(async (strings: TemplateStringsArray) => strings.join('?').includes('FOR UPDATE') ? [{ id: 'c' }] : [{ n: 1n }]),
      case: { findFirst: jest.fn().mockResolvedValue({ id: 'c' }) },
      firm: { findUnique: jest.fn().mockResolvedValue({ vatRegistered: true }) },
      caseCustomer: { findMany: jest.fn().mockResolvedValue([]) },
      caseFeeMilestone: {
        findMany: jest.fn(async ({ where }) => rows.filter(m => where.id.in.includes(m.id) && m.caseId === where.caseId && m.firmId === where.firmId && where.status.in.includes(m.status) && m.invoiceId === null)),
        updateMany: jest.fn(async ({ data }) => { rows.forEach(m => Object.assign(m, data)); return { count: rows.length }; }),
      },
      invoice: { create: jest.fn(async ({ data }) => ({ id: 'invoice', ...data, lineItems: data.lineItems.create })) },
    };
    db.$transaction = jest.fn((fn: any) => fn(db));
    service = new BillingService(db, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
  });
  it('reads amount/tax from DB, honors description/order and claims the milestone in the same tx', async () => {
    const [invoice] = await service.createInvoice(user, { caseId: 'c' }, { milestoneLines: [{ id: 'm', description: 'ตกลงเก็บบางส่วน', sortOrder: 0 }], lineItems: [{ description: 'อื่น', quantity: 1, unitPrice: 100, sortOrder: 1 }] });
    expect(invoice.lineItems).toEqual([
      { description: 'ตกลงเก็บบางส่วน', quantity: 1, unitPrice: 250.25, amount: 250.25, taxClass: 'ADVISORY_VAT', sortOrder: 0 },
      { description: 'อื่น', quantity: 1, unitPrice: 100, amount: 100, taxClass: 'LITIGATION_EXEMPT', sortOrder: 1 },
    ]);
    expect(invoice.totalAmount).toBe(367.77);
    expect(db.$queryRaw.mock.calls[0][0].join('?')).toContain('FOR UPDATE');
    expect(db.$queryRaw.mock.calls[0].slice(1)).toEqual(['c', 'f']);
    expect(db.caseFeeMilestone.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['m'] }, firmId: 'f', caseId: 'c', invoiceId: null, status: { in: ['PENDING', 'PARTIAL'] } }, data: { status: 'INVOICED', invoiceId: 'invoice' } });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    await expect(service.createInvoice(user, { caseId: 'c' }, { milestoneLines: [{ id: 'm' }] })).rejects.toThrow(BadRequestException);
    expect(db.invoice.create).toHaveBeenCalledTimes(1);
  });
  it('uses the full milestone amount when no closeAmount is set', async () => {
    rows[0].closeAmount = null;
    rows[0].status = 'PENDING';
    const [invoice] = await service.createInvoice(user, { caseId: 'c' }, { milestoneLines: [{ id: 'm' }] });
    expect(invoice.lineItems[0]).toMatchObject({ amount: 1000, unitPrice: 1000, description: 'ค่าทนายงวดแรก' });
  });
  it.each(['other case', 'other firm', 'INVOICED', 'WAIVED', 'duplicate'])('rejects %s before invoice creation', async kind => {
    if (kind === 'other case') rows[0].caseId = 'foreign';
    if (kind === 'other firm') rows[0].firmId = 'foreign';
    if (kind === 'INVOICED' || kind === 'WAIVED') rows[0].status = kind;
    const milestoneLines = kind === 'duplicate' ? [{ id: 'm' }, { id: 'm' }] : [{ id: 'm' }];
    await expect(service.createInvoice(user, { caseId: 'c' }, { milestoneLines })).rejects.toThrow(BadRequestException);
    expect(db.invoice.create).not.toHaveBeenCalled();
  });
  it('rejects milestone lines without a case and a failed guarded claim', async () => {
    await expect(service.createInvoice(user, {}, { milestoneLines: [{ id: 'm' }] })).rejects.toThrow(BadRequestException);
    db.caseFeeMilestone.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.createInvoice(user, { caseId: 'c' }, { milestoneLines: [{ id: 'm' }] })).rejects.toThrow(ConflictException);
  });
});
