import { BadRequestException } from '@nestjs/common';
import { SaasAuthService } from './saas-auth.service';

describe('password reset', () => {
  const build = (claimCount: number) => {
    const tx = {
      passwordResetToken: {
        findUnique: jest.fn().mockResolvedValue({ id: 'r1', userId: 'u1' }),
        updateMany: jest.fn().mockResolvedValue({ count: claimCount }),
      },
      user: { update: jest.fn() },
      session: { updateMany: jest.fn() },
    };
    const prisma = { $transaction: jest.fn(async (cb: any) => cb(tx)) } as any;
    return { svc: new (SaasAuthService as any)(prisma, {}, {}, {}, {}) as SaasAuthService, tx };
  };

  it('ends every existing session of the account', async () => {
    const { svc, tx } = build(1);
    await svc.resetPassword('tok', 'new-password');
    expect(tx.user.update).toHaveBeenCalled();
    expect(tx.session.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'u1', revokedAt: null } }));
  });

  it('a token already claimed (or expired) changes nothing', async () => {
    const { svc, tx } = build(0);
    await expect(svc.resetPassword('tok', 'new-password')).rejects.toThrow(BadRequestException);
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.session.updateMany).not.toHaveBeenCalled();
  });
});
