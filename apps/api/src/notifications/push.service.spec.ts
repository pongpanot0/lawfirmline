import { Test, TestingModule } from '@nestjs/testing';
import { PushService } from './push.service';
import { PrismaService } from '../prisma/prisma.service';

describe('PushService', () => {
  let service: PushService;
  const mockPrisma = {
    deviceToken: {
      upsert: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  const fetchMock = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
    mockPrisma.deviceToken.findMany.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [PushService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get(PushService);
  });

  it('register upserts on token so a shared device follows the last login', async () => {
    await service.register('user-2', 'ExponentPushToken[x]', 'ios');
    expect(mockPrisma.deviceToken.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { token: 'ExponentPushToken[x]' },
        update: expect.objectContaining({ userId: 'user-2' }),
      }),
    );
  });

  it('unregister only deletes the caller own token', async () => {
    await service.unregister('user-1', 'tok');
    expect(mockPrisma.deviceToken.deleteMany).toHaveBeenCalledWith({
      where: { token: 'tok', userId: 'user-1' },
    });
  });

  it('sendToUsers prunes DeviceNotRegistered tokens and reports delivery', async () => {
    mockPrisma.deviceToken.findMany.mockResolvedValue([
      { token: 'alive', userId: 'u1' },
      { token: 'dead', userId: 'u1' },
    ]);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { status: 'ok' },
          { status: 'error', details: { error: 'DeviceNotRegistered' } },
        ],
      }),
    });

    const delivered = await service.sendToUsers(['u1'], { title: 't', body: 'b' });

    expect(delivered).toBe(true);
    expect(mockPrisma.deviceToken.deleteMany).toHaveBeenCalledWith({
      where: { token: { in: ['dead'] } },
    });
  });

  it('returns false without calling Expo when no devices are registered', async () => {
    const delivered = await service.sendToUsers(['u1'], { title: 't', body: 'b' });
    expect(delivered).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('send gives each recipient their own payload on every device', async () => {
    mockPrisma.deviceToken.findMany.mockResolvedValue([
      { token: 'a1', userId: 'a' },
      { token: 'a2', userId: 'a' },
      { token: 'b1', userId: 'b' },
    ]);
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: [{ status: 'ok' }] }) });

    await service.send([
      { userId: 'a', title: 't', body: 'b', data: { notificationId: 'na' }, badge: 2 },
      { userId: 'b', title: 't', body: 'b', data: { notificationId: 'nb' } },
    ]);

    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent.map((m: any) => [m.to, m.data.notificationId, m.badge])).toEqual([
      ['a1', 'na', 2],
      ['a2', 'na', 2],
      ['b1', 'nb', undefined],
    ]);
  });
});
