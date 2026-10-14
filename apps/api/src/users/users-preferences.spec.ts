import { UsersService } from './users.service';

describe('UsersService preferences', () => {
  const prisma = { user: { update: jest.fn(), findUnique: jest.fn() } };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new UsersService(prisma as any);

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.user.findUnique.mockResolvedValue({ dailyDigestEnabled: true, lineUserId: null, email: 'a@b.c', emailSignature: 'x' });
  });

  it('returns the signature and stores trimmed text', async () => {
    const res = await service.updatePreferences('u1', { emailSignature: ' สมชาย\nทนาย ' });
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { emailSignature: 'สมชาย\nทนาย' } });
    expect(res.emailSignature).toBe('x');
  });

  it('stores an empty signature as null and leaves it alone when omitted', async () => {
    await service.updatePreferences('u1', { emailSignature: '  ' });
    expect(prisma.user.update).toHaveBeenLastCalledWith({ where: { id: 'u1' }, data: { emailSignature: null } });
    await service.updatePreferences('u1', { dailyDigestEnabled: false });
    expect(prisma.user.update).toHaveBeenLastCalledWith({ where: { id: 'u1' }, data: { dailyDigestEnabled: false } });
  });
});
