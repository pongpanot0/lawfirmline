import { FirmRole } from '@lawfirm/shared';
import { ReportsService } from './reports.service';

describe('ReportsService.getSummary scope', () => {
  const prisma = {
    case: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]), groupBy: jest.fn().mockResolvedValue([]) },
    timeEntry: { findMany: jest.fn().mockResolvedValue([]) },
    calendarEvent: { findMany: jest.fn().mockResolvedValue([]) },
    expense: { findMany: jest.fn().mockResolvedValue([]) },
  } as any;
  const caseAccess = { getCaseFilterForFinancials: jest.fn().mockReturnValue({}) } as any;
  const svc = new ReportsService(prisma, caseAccess, { suggest: jest.fn().mockResolvedValue([]) } as any);
  const user = (firmRole: FirmRole) => ({ id: 'u', firmId: 'f', firmName: 'F', firmRole }) as any;

  it.each([[FirmRole.OWNER, 'firm'], [FirmRole.OFFICE_MANAGER, 'firm'], [FirmRole.LAWYER, 'user']])('%s -> %s', async (role, scope) => {
    expect((await svc.getSummary(user(role))).scope).toBe(scope);
  });
});

describe('ReportsService.getFirmMetrics', () => {
  const NOW = new Date('2026-11-15T05:00:00Z');
  const owner = { id: 'o', firmId: 'f1', firmName: 'F', firmRole: FirmRole.OWNER } as any;
  const entry = (userId: string, hours: number, invoice: any = null, rate = 1000) => ({ userId, hours, rate, invoice });

  function build(entries: any[], invoices: any[], payments: any[], suggestPerDay = 0) {
    const prisma = {
      firmMember: {
        findMany: jest.fn().mockResolvedValue([
          { userId: 'a', role: 'LAWYER', monthlyBillableTargetHours: 100, user: { firstName: 'A', lastName: 'X' } },
          { userId: 'b', role: 'LAWYER', monthlyBillableTargetHours: null, user: { firstName: 'B', lastName: 'Y' } },
        ]),
      },
      timeEntry: { findMany: jest.fn().mockResolvedValue(entries) },
      invoice: { findMany: jest.fn().mockResolvedValue(invoices) },
      invoicePayment: { findMany: jest.fn().mockResolvedValue(payments) },
    } as any;
    const suggest = jest.fn().mockResolvedValue(Array.from({ length: suggestPerDay }));
    const svc = new ReportsService(prisma, {} as any, { suggest } as any);
    return { prisma, suggest, svc };
  }

  it('scopes entries to the firm, billable and the period', async () => {
    const { prisma, svc } = build([], [], []);
    await svc.getFirmMetrics(owner, 'this_month', NOW);
    expect(prisma.timeEntry.findMany.mock.calls[0][0].where).toMatchObject({
      case: { firmId: 'f1' },
      billable: true,
      date: { gte: new Date('2026-10-31T17:00:00Z'), lt: new Date('2026-11-30T17:00:00Z') },
    });
    expect(prisma.firmMember.findMany.mock.calls[0][0].where).toEqual({ firmId: 'f1' });
  });

  it('written-off counts as worked, not invoiced; DRAFT invoice is not invoiced', async () => {
    const sent = { id: 'i1', status: 'SENT', splitGroupId: null };
    const draft = { id: 'i2', status: 'DRAFT', splitGroupId: null };
    const { svc } = build(
      [entry('a', 10, sent), entry('a', 2, null), entry('a', 5, draft)],
      [{ id: 'i1', splitGroupId: null, totalAmount: 10000 }],
      [{ invoiceId: 'i1', amount: 10000 }],
    );
    const r = await svc.getFirmMetrics(owner, 'this_month', NOW);
    const a = r.members.find((m: any) => m.userId === 'a')!;
    expect(a).toMatchObject({ workedHours: 17, invoicedHours: 10, collectedHours: 10, name: 'A X' });
    expect(a.realization).toBe(0.5882);
    expect(a.collection).toBe(1);
    expect(a.utilization).toBe(0.34); // 17 / (100 x 0.5 prorated)
    expect(r.timeBasedBilling).toBe(true);
    expect(r.members.find((m: any) => m.userId === 'b')!.utilization).toBeNull();
  });

  it('collects by split group; unsplit invoices are their own group', async () => {
    const main = { id: 'm', status: 'SENT', splitGroupId: 'g' };
    const solo = { id: 's', status: 'SENT', splitGroupId: null };
    const { prisma, svc } = build(
      [entry('a', 10, main), entry('a', 4, solo)],
      [
        { id: 'm', splitGroupId: 'g', totalAmount: 60 },
        { id: 'm2', splitGroupId: 'g', totalAmount: 40 },
        { id: 's', splitGroupId: null, totalAmount: 100 },
      ],
      [{ invoiceId: 'm2', amount: 60 }, { invoiceId: 's', amount: 50 }],
    );
    const r = await svc.getFirmMetrics(owner, 'this_month', NOW);
    const a = r.members.find((m: any) => m.userId === 'a')!;
    expect(a.collectedHours).toBeCloseTo(10 * 0.6 + 4 * 0.5, 6);
    expect(prisma.invoice.findMany.mock.calls[0][0].where.firmId).toBe('f1');
    expect(prisma.invoicePayment.findMany.mock.calls[0][0].where.firmId).toBe('f1');
  });

  it('timeBasedBilling false when nothing invoiced; firm totals sum members; pendingDrafts over 7 days', async () => {
    const { svc, suggest } = build([entry('a', 8), entry('b', 4)], [], [], 2);
    const r = await svc.getFirmMetrics(owner, 'quarter', NOW);
    expect(r.timeBasedBilling).toBe(false);
    expect(r.firm.workedHours).toBe(12);
    expect(r.firm.targetMonthly).toBe(100);
    // utilization counts only members who have a target: 8 / (100 x 1.5 prorated months)
    expect(r.firm.utilization).toBe(0.0533);
    expect(suggest).toHaveBeenCalledTimes(14);
    expect(r.members[0].pendingDrafts7d).toBe(14);
  });
});
