import { ConflictException, NotFoundException } from '@nestjs/common';
import { OutlookAdminStatusService } from './outlook-admin-status.service';

const user: any = { id: 'admin', firmId: 'f1' };
const row = {
  id: 'c1', mailboxAddress: 'a@x.com', status: 'EXPIRED', lastError: 'Token refresh failed: invalid_grant', lastSyncedAt: null,
  updatedAt: new Date(), syncInboxToIntake: true, syncCalendar: false, subscriptionExpiresAt: null, userId: 'u1', connectedByUserId: 'u1',
  user: { id: 'u1', firstName: 'Somchai', lastName: 'J' },
  accessTokenEnc: 'SECRET', refreshTokenEnc: 'SECRET', webhookSecret: 'SECRET', deltaLink: 'SECRET',
};

function setup() {
  const prisma: any = {
    mailboxConnection: { findMany: jest.fn().mockResolvedValue([row]), findFirstOrThrow: jest.fn().mockResolvedValue({ firmId: 'f1', mailboxAddress: 'a@x.com', userId: 'u1', connectedByUserId: 'u1' }) },
    caseExternalLink: {
      groupBy: jest.fn().mockResolvedValueOnce([{ connectionId: 'c1', kind: 'OUTLOOK_FOLDER', _count: { _all: 3 } }, { connectionId: 'c1', kind: 'DRIVE_FOLDER', _count: { _all: 1 } }])
        .mockResolvedValueOnce([{ connectionId: 'c1', kind: 'OUTLOOK_FOLDER', _count: { _all: 1 } }]),
      findMany: jest.fn().mockResolvedValue([{ id: 'l1', kind: 'OUTLOOK_FOLDER', caseId: 'k1', displayPath: 'Inbox/X', lastSyncedAt: null, lastError: '404 not found', case: { ownRef: 'R1', title: 'T' }, connection: { mailboxAddress: 'a@x.com' } }]),
    },
    calendarEventOutlookCopy: { groupBy: jest.fn().mockResolvedValue([{ connectionId: 'c1', _count: { _all: 2 } }]) },
    firmMember: { findMany: jest.fn().mockResolvedValue([{ user: { id: 'u1', firstName: 'Somchai', lastName: 'J', email: 's@x.com' } }, { user: { id: 'u2', firstName: 'Mali', lastName: null, email: 'm@x.com' } }]) },
    auditLog: { create: jest.fn() },
  };
  const connections: any = { assertOwnership: jest.fn().mockResolvedValue(undefined), notifyReconnectNeeded: jest.fn().mockResolvedValue(undefined) };
  return { prisma, connections, svc: new OutlookAdminStatusService(prisma, connections) };
}

describe('OutlookAdminStatusService', () => {
  it('shapes the status, scopes by firm, excludes EXTERNAL and leaks no secrets', async () => {
    const { svc, prisma } = setup();
    const res = await svc.getStatus(user);
    expect(JSON.stringify(res)).not.toContain('SECRET');
    expect(prisma.mailboxConnection.findMany.mock.calls[0][0].where).toEqual({ firmId: 'f1' });
    expect(prisma.firmMember.findMany.mock.calls[0][0].where).toEqual({ firmId: 'f1', role: { not: 'EXTERNAL' } });
    expect(prisma.caseExternalLink.findMany.mock.calls[0][0].take).toBe(50);
    expect(res.summary).toEqual({ members: 2, connected: 0, problems: 1, notConnected: 2 });
    expect(res.connections[0]).toMatchObject({
      health: 'BROKEN', user: { id: 'u1', name: 'Somchai J' }, folderLinks: { total: 3, failing: 1 }, driveLinks: 1, calendarCopyErrors: 2,
      lastErrorThai: 'สิทธิ์หมดอายุ ต้องเชื่อมต่อใหม่',
    });
    expect(res.failingLinks[0]).toMatchObject({ linkId: 'l1', ownRef: 'R1', lastErrorThai: expect.stringContaining('ไม่พบ') });
    expect(res.notConnected[1]).toEqual({ userId: 'u2', name: 'Mali', email: 'm@x.com' });
  });

  it('remind notifies, audits, and rate-limits per connection', async () => {
    const { svc, prisma, connections } = setup();
    await expect(svc.remind(user, 'c1')).resolves.toEqual({ notified: true });
    expect(connections.notifyReconnectNeeded).toHaveBeenCalledWith(expect.objectContaining({ mailboxAddress: 'a@x.com' }), 'admin');
    expect(prisma.auditLog.create.mock.calls[0][0].data.action).toBe('M365_RECONNECT_REQUESTED');
    await expect(svc.remind(user, 'c1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('remind 404s for a connection outside the firm', async () => {
    const { svc, connections } = setup();
    connections.assertOwnership.mockRejectedValue(new NotFoundException());
    await expect(svc.remind(user, 'zzz')).rejects.toBeInstanceOf(NotFoundException);
  });
});
