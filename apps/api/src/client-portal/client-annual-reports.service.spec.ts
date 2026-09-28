import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ClientAnnualReportsService } from './client-annual-reports.service';

const user = { id: 'owner-1', firmId: 'firm-1' } as any;
const portalUser = {
  clientContactId: 'contact-1', clientId: 'client-1', firmId: 'firm-1',
  name: 'Contact', email: null,
};

function prismaMock() {
  const prisma = {
    client: { findFirst: jest.fn().mockResolvedValue({ id: 'client-1', name: 'บริษัท ทดสอบ' }) },
    case: { findMany: jest.fn().mockResolvedValue([{
      id: 'case-1', ownRef: 'REF-1', customerRef: 'CUST-1', title: 'คดีตัวอย่าง',
      blackCaseNumber: 'ดำ 1/2569', redCaseNumber: 'แดง 2/2569',
      clientName: 'ผู้เอาประกัน', openedAt: new Date('2025-08-01T00:00:00Z'),
      closedAt: new Date('2026-09-01T00:00:00Z'), status: 'CLOSED', stage: 'CLOSING',
      outcome: 'SETTLED', closingSummary: 'ตกลงกันแล้ว', claimedAmount: 100000,
      caseType: { name: 'แพ่ง' }, leadLawyer: { firstName: 'ทนาย', lastName: 'ก' },
      insuranceClaim: { policyNumber: 'POL-1' }, intake: null,
      statusLogs: [{
        fromStatus: 'IN_PROGRESS', toStatus: 'CLOSED',
        createdAt: new Date('2026-09-01T00:00:00Z'),
      }],
      activities: [{ description: 'ตกลงกันแล้ว\nผลคดี: SETTLED' }],
    }]) },
    invoice: {
      findMany: jest.fn().mockResolvedValue([{ totalAmount: 12000 }]),
      count: jest.fn().mockResolvedValue(0),
    },
    invoicePayment: { findMany: jest.fn().mockResolvedValue([{ amount: 5000 }]) },
    clientContact: { findMany: jest.fn().mockResolvedValue([{ id: 'contact-1' }]) },
    clientAnnualReport: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn().mockResolvedValue({ id: 'report-1' }),
    },
    contactCaseAccess: { findMany: jest.fn().mockResolvedValue([]) },
  };
  return {
    ...prisma,
    $transaction: jest.fn(async (fn: (tx: any) => Promise<unknown>) => fn(prisma)),
  };
}

let mock: ReturnType<typeof prismaMock>;
let service: ClientAnnualReportsService;

beforeEach(() => {
  mock = prismaMock();
  service = new ClientAnnualReportsService(mock as any);
});

it('previews a payer report with prior-year cases and separate financial totals', async () => {
  const { snapshot } = await service.preview(user, 'client-1', 2026, 'PAYER');
  expect(snapshot.cases[0]).toMatchObject({
    ownRef: 'REF-1', customerRef: 'CUST-1', policyRef: 'POL-1',
    blackCaseNumber: 'ดำ 1/2569', redCaseNumber: 'แดง 2/2569',
    closingSummary: 'ตกลงกันแล้ว',
  });
  expect(snapshot.totals).toMatchObject({
    cases: 1, opened: 0, closedInYear: 1, closedAtYearEnd: 1, ongoing: 0,
    claimedAmount: 100000, claimedCaseCount: 1,
    invoicedAmount: 12000, receivedAmount: 5000, unassignedInvoiceCount: 0,
  });
  expect(mock.case.findMany.mock.calls[0][0].where).toMatchObject({
    firmId: 'firm-1', deletedAt: null,
    customers: { some: { customerId: 'client-1' } },
  });
  expect(mock.invoice.findMany.mock.calls[0][0].where).toMatchObject({
    billToCustomerId: 'client-1', status: { in: ['SENT', 'PAID'] },
  });
  expect(mock.invoicePayment.findMany.mock.calls[0][0].where.receivedAt).toEqual({
    gte: new Date('2026-01-01T00:00:00Z'), lt: new Date('2027-01-01T00:00:00Z'),
  });
});

it('requires a fresh reviewed preview before publication', async () => {
  await expect(service.publish(
    user, 'client-1', 2025, 'PAYER', ['case-1'], ['contact-1'], 'old-hash',
  )).rejects.toBeInstanceOf(ConflictException);
  expect(mock.clientAnnualReport.create).not.toHaveBeenCalled();
});

it('publishes the reviewed snapshot only to named portal contacts', async () => {
  const { fingerprint } = await service.preview(user, 'client-1', 2025, 'PAYER', ['case-1']);
  await service.publish(user, 'client-1', 2025, 'PAYER', ['case-1'], ['contact-1'], fingerprint);
  expect(mock.clientAnnualReport.updateMany).toHaveBeenCalledWith({
    where: { firmId: 'firm-1', clientId: 'client-1', year: 2025, audience: 'PAYER', revokedAt: null },
    data: { revokedAt: expect.any(Date) },
  });
  expect(mock.clientAnnualReport.create.mock.calls[0][0].data).toMatchObject({
    firmId: 'firm-1', clientId: 'client-1', year: 2025,
    recipientContactIds: ['contact-1'], fingerprint,
    snapshot: { totals: { cases: 1 } },
  });
});

it('does not publish an unfinished annual period', async () => {
  await expect(service.publish(
    user, 'client-1', 2100, 'PAYER', ['case-1'], ['contact-1'], 'hash',
  )).rejects.toBeInstanceOf(BadRequestException);
  expect(mock.clientAnnualReport.create).not.toHaveBeenCalled();
});

it('keeps a case open at year-end when it closes in a later year', async () => {
  const [caseRow] = await mock.case.findMany();
  mock.case.findMany.mockResolvedValue([{
    ...caseRow,
    statusLogs: [],
    closedAt: new Date('2027-02-01T00:00:00Z'),
  }]);
  const { snapshot } = await service.preview(user, 'client-1', 2026, 'PAYER');
  expect(snapshot.totals).toMatchObject({ cases: 1, ongoing: 1, closedInYear: 0, closedAtYearEnd: 0 });
  expect(snapshot.cases[0]).toMatchObject({ statusAtYearEnd: 'IN_PROGRESS', closedAt: null });
});

it('counts a reopened case as ongoing at year-end', async () => {
  const [caseRow] = await mock.case.findMany();
  mock.case.findMany.mockResolvedValue([{
    ...caseRow,
    status: 'IN_PROGRESS', closedAt: null, outcome: 'IN_PROGRESS', closingSummary: null,
    statusLogs: [
      { fromStatus: 'IN_PROGRESS', toStatus: 'CLOSED', createdAt: new Date('2026-04-01T00:00:00Z') },
      { fromStatus: 'CLOSED', toStatus: 'IN_PROGRESS', createdAt: new Date('2026-05-01T00:00:00Z') },
    ],
  }]);
  const { snapshot } = await service.preview(user, 'client-1', 2026, 'PAYER');
  expect(snapshot.totals).toMatchObject({ cases: 1, ongoing: 1, closedInYear: 1, closedAtYearEnd: 0 });
  expect(snapshot.cases[0]).toMatchObject({ statusAtYearEnd: 'IN_PROGRESS', closedAt: null });
});

it('uses the earlier closure details when the case was reopened later', async () => {
  const [caseRow] = await mock.case.findMany();
  mock.case.findMany.mockResolvedValue([{
    ...caseRow,
    status: 'IN_PROGRESS', closedAt: null, outcome: 'IN_PROGRESS', closingSummary: 'รายละเอียดใหม่',
    statusLogs: [
      { fromStatus: 'IN_PROGRESS', toStatus: 'CLOSED', createdAt: new Date('2026-09-01T00:00:00Z') },
      { fromStatus: 'CLOSED', toStatus: 'IN_PROGRESS', createdAt: new Date('2027-02-01T00:00:00Z') },
    ],
  }]);
  const { snapshot } = await service.preview(user, 'client-1', 2026, 'PAYER');
  expect(snapshot.cases[0]).toMatchObject({
    statusAtYearEnd: 'CLOSED', closingSummary: 'ตกลงกันแล้ว', outcome: 'SETTLED',
  });
});

it('blocks publishing a closed case without its closing details', async () => {
  const [caseRow] = await mock.case.findMany();
  mock.case.findMany.mockResolvedValue([{
    ...caseRow,
    closingSummary: null,
    closedAt: new Date('2025-09-01T00:00:00Z'),
    statusLogs: [{
      fromStatus: 'IN_PROGRESS', toStatus: 'CLOSED',
      createdAt: new Date('2025-09-01T00:00:00Z'),
    }],
  }]);
  const { fingerprint } = await service.preview(user, 'client-1', 2025, 'PAYER', ['case-1']);
  await expect(service.publish(
    user, 'client-1', 2025, 'PAYER', ['case-1'], ['contact-1'], fingerprint,
  )).rejects.toBeInstanceOf(BadRequestException);
  expect(mock.clientAnnualReport.create).not.toHaveBeenCalled();
});

it('scopes portal reads to one recipient and does not grant case-page access', async () => {
  const preview = await service.preview(user, 'client-1', 2026, 'PAYER');
  mock.clientAnnualReport.findFirst.mockResolvedValue({
    id: 'report-1', year: 2026, audience: 'PAYER',
    publishedAt: new Date('2026-12-31T17:00:00Z'), snapshot: preview.snapshot,
  });
  const report = await service.getPortal(portalUser, 'report-1');
  expect(report.snapshot.cases[0].canOpenCase).toBe(false);
  expect(mock.clientAnnualReport.findFirst.mock.calls[0][0].where).toMatchObject({
    firmId: 'firm-1', clientId: 'client-1',
    recipientContactIds: { has: 'contact-1' }, revokedAt: null,
  });
  mock.clientAnnualReport.findFirst.mockResolvedValue(null);
  await expect(service.getPortal({ ...portalUser, clientContactId: 'other-contact' }, 'report-1'))
    .rejects.toBeInstanceOf(NotFoundException);
});
