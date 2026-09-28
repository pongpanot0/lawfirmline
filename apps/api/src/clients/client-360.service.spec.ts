import { NotFoundException } from '@nestjs/common';
import { FirmRole } from '@lawfirm/shared';
import { Client360Service } from './client-360.service';

const user = { id: 'staff-1', firmId: 'firm-1', firmRole: FirmRole.ASSISTANT } as any;
const input = {
  caseId: 'case-1', contactId: 'contact-1', recipientUserId: 'lawyer-1',
  channel: 'INBOUND_CALL' as const, reached: false,
  note: 'ทนายไปศาล ฝากโทรกลับเรื่องกรมธรรม์',
};

function setup() {
  const prisma: any = {
    client: { findFirst: jest.fn().mockResolvedValue({ id: 'client-1', name: 'ลูกค้า', contacts: [] }) },
    case: { findFirst: jest.fn().mockResolvedValue({ id: 'case-1', ownRef: 'TSB-1' }), findMany: jest.fn() },
    clientContact: { findFirst: jest.fn().mockResolvedValue({ id: 'contact-1', name: 'คุณมณี', phone: '0812345678', email: null }) },
    firmMember: { findFirst: jest.fn().mockResolvedValue({ userId: 'lawyer-1', user: { firstName: 'ทนาย', lastName: 'กิตติ' } }), findMany: jest.fn() },
    task: { create: jest.fn().mockResolvedValue({ id: 'task-1' }), findMany: jest.fn() },
    taskAssignmentLog: { create: jest.fn().mockResolvedValue({ id: 'log-1' }) },
    caseActivity: { create: jest.fn().mockResolvedValue({ id: 'activity-1' }), findMany: jest.fn() },
    clientAnnualReport: { findFirst: jest.fn() },
  };
  prisma.$transaction = jest.fn((callback: (tx: any) => Promise<unknown>) => callback(prisma));
  const access = {
    getClientFilterForUser: jest.fn(() => ({ firmId: 'firm-1' })),
    getCaseFilterForUser: jest.fn(() => ({ firmId: 'firm-1', deletedAt: null })),
    getTaskFilterForUser: jest.fn(() => ({ assigneeId: 'staff-1' })),
  };
  const notifier = { notifyAssigned: jest.fn().mockResolvedValue(undefined) };
  return { service: new Client360Service(prisma, access as any, notifier as any), prisma, notifier };
}

it('records an unanswered client call and creates one callback task for the requested lawyer', async () => {
  const { service, prisma, notifier } = setup();

  await expect(service.logContact(user, 'client-1', input)).resolves.toEqual({ activityId: 'activity-1', taskId: 'task-1' });
  expect(prisma.case.findFirst.mock.calls[0][0].where).toMatchObject({
    id: 'case-1', AND: [
      { firmId: 'firm-1', deletedAt: null },
      { OR: [{ clientId: 'client-1' }, { additionalClients: { some: { clientId: 'client-1' } } }, { customers: { some: { customerId: 'client-1' } } }] },
    ],
  });
  expect(prisma.firmMember.findFirst).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({ firmId: 'firm-1', userId: 'lawyer-1' }),
  }));
  expect(prisma.task.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
    caseId: 'case-1', assigneeId: 'lawyer-1', createdById: 'staff-1', title: 'โทรกลับ คุณมณี',
    description: expect.stringContaining('0812345678'),
  }) }));
  expect(prisma.taskAssignmentLog.create).toHaveBeenCalledTimes(1);
  expect(prisma.caseActivity.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
    caseId: 'case-1', contactData: expect.objectContaining({ reached: false, taskId: 'task-1' }),
  }) }));
  expect(notifier.notifyAssigned).toHaveBeenCalledWith(expect.objectContaining({ userIds: ['lawyer-1'] }));
});

it('records a reached call without creating a callback task', async () => {
  const { service, prisma, notifier } = setup();
  await expect(service.logContact(user, 'client-1', { ...input, reached: true })).resolves.toEqual({ activityId: 'activity-1', taskId: null });
  expect(prisma.task.create).not.toHaveBeenCalled();
  expect(prisma.caseActivity.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
    contactData: expect.objectContaining({ reached: true, taskId: null }),
  }) }));
  expect(notifier.notifyAssigned).not.toHaveBeenCalled();
});

it('does not log a contact against a case outside this client or the caller’s access', async () => {
  const { service, prisma } = setup();
  prisma.case.findFirst.mockResolvedValue(null);
  await expect(service.logContact(user, 'client-1', input)).rejects.toBeInstanceOf(NotFoundException);
  expect(prisma.$transaction).not.toHaveBeenCalled();
});

it('shows a case once with both customer roles and includes tasks created by the caller', async () => {
  const { service, prisma } = setup();
  prisma.case.findMany.mockResolvedValue([{
    id: 'case-1', ownRef: 'TSB-1', title: 'คดีเดียว', clientId: 'client-1',
    additionalClients: [], customers: [{ id: 'payer-link' }],
    leadLawyer: { id: 'lawyer-1', firstName: 'ทนาย', lastName: 'กิตติ' },
    insuranceClaim: null, intake: null,
  }]);
  prisma.task.findMany.mockResolvedValue([{ id: 'task-1', createdById: 'staff-1' }]);
  prisma.caseActivity.findMany.mockResolvedValue([]);
  prisma.firmMember.findMany.mockResolvedValue([]);

  const overview = await service.overview(user, 'client-1');

  expect(overview.cases).toHaveLength(1);
  expect(overview.cases[0].roles).toEqual(['REPRESENTED', 'PAYER']);
  expect(overview.tasks).toHaveLength(1);
  expect(prisma.task.findMany.mock.calls[0][0].where.AND[1]).toEqual({
    OR: [{ assigneeId: 'staff-1' }, { createdById: 'staff-1' }],
  });
});
