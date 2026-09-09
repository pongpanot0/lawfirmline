import { Test, TestingModule } from '@nestjs/testing';
import { OutlookWebhookController } from './outlook-webhook.controller';
import { PrismaService } from '../prisma/prisma.module';
import { OutlookSyncService } from './outlook-sync.service';

function mockResponse() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res);
  return res;
}

describe('OutlookWebhookController', () => {
  let controller: OutlookWebhookController;
  const mockPrisma = { mailboxConnection: { findFirst: jest.fn() } };
  const mockSync = { syncConnection: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OutlookWebhookController,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: OutlookSyncService, useValue: mockSync },
      ],
    }).compile();
    controller = module.get(OutlookWebhookController);
  });

  it('echoes the validationToken as plain text (Graph subscription handshake)', async () => {
    const res = mockResponse();
    await controller.receive('the-validation-token', {}, res);
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/plain');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith('the-validation-token');
  });

  it('acks with 202 immediately and does not sync when clientState does not match', async () => {
    mockPrisma.mailboxConnection.findFirst.mockResolvedValue({ id: 'conn-1', webhookSecret: 'real-secret' });
    const res = mockResponse();

    await controller.receive(undefined, { value: [{ subscriptionId: 'sub-1', clientState: 'forged', resource: 'x' }] }, res);
    // Let the fire-and-forget notification handler's microtask run.
    await new Promise((resolve) => setImmediate(resolve));

    expect(res.status).toHaveBeenCalledWith(202);
    expect(mockSync.syncConnection).not.toHaveBeenCalled();
  });

  it('syncs the matching connection when clientState is correct', async () => {
    mockPrisma.mailboxConnection.findFirst.mockResolvedValue({ id: 'conn-1', webhookSecret: 'real-secret' });
    mockSync.syncConnection.mockResolvedValue({ messagesSynced: 1 });
    const res = mockResponse();

    await controller.receive(undefined, { value: [{ subscriptionId: 'sub-1', clientState: 'real-secret', resource: 'x' }] }, res);
    await new Promise((resolve) => setImmediate(resolve));

    expect(mockSync.syncConnection).toHaveBeenCalledWith('conn-1');
  });

  it('ignores a notification for an unknown subscription id', async () => {
    mockPrisma.mailboxConnection.findFirst.mockResolvedValue(null);
    const res = mockResponse();

    await controller.receive(undefined, { value: [{ subscriptionId: 'unknown-sub', clientState: 'anything', resource: 'x' }] }, res);
    await new Promise((resolve) => setImmediate(resolve));

    expect(mockSync.syncConnection).not.toHaveBeenCalled();
  });
});
