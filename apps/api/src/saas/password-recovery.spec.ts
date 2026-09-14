import { SaasAuthService } from './saas-auth.service';
import { PrismaService } from '../prisma/prisma.module';
import { TenantService } from './tenant.service';
import { CaseTypesService } from '../case-types/case-types.service';
import { DeadlineRulesService } from '../deadlines/deadline-rules.service';
import { EmailService } from '../notifications/email.service';

describe('password recovery delivery', () => {
  const prisma = { user: { findUnique: jest.fn() }, passwordResetToken: { create: jest.fn() } };
  const email = { isConfigured: jest.fn(), getAppUrl: jest.fn(() => 'https://samnuan.example'), sendPasswordResetEmail: jest.fn() };
  const service = new SaasAuthService(prisma as unknown as PrismaService, {} as TenantService, {} as CaseTypesService, {} as DeadlineRulesService, email as unknown as EmailService);
  const originalEnv = process.env.NODE_ENV;
  beforeEach(() => {
    jest.clearAllMocks();
    email.isConfigured.mockReturnValue(true);
    process.env.NODE_ENV = 'test';
  });
  afterEach(() => { process.env.NODE_ENV = originalEnv; });

  it('sends the saved one-hour recovery token to the requested account', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'test-user' });
    const before = Date.now();
    const result = await service.createPasswordResetToken('test@example.test');
    expect(prisma.passwordResetToken.create).toHaveBeenCalledWith({ data: { userId: 'test-user', token: result!.token, expiresAt: expect.any(Date) } });
    const expires = prisma.passwordResetToken.create.mock.calls[0][0].data.expiresAt.getTime();
    expect(expires - before).toBeGreaterThanOrEqual(3_600_000);
    expect(expires - before).toBeLessThan(3_601_000);
    expect(email.sendPasswordResetEmail).toHaveBeenCalledWith('test@example.test', `https://samnuan.example/reset-password?token=${result!.token}`);
  });

  it('does not send mail or mint a token for an unknown account', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    expect(await service.createPasswordResetToken('missing@example.test')).toBeNull();
    expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
    expect(email.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('rejects unconfigured production delivery before looking up either account', async () => {
    process.env.NODE_ENV = 'production';
    email.isConfigured.mockReturnValue(false);
    await expect(service.createPasswordResetToken('test@example.test')).rejects.toThrow('temporarily unavailable');
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});

import { ConfigService } from '@nestjs/config';

describe('recovery email transport', () => {
  let fetchMock: jest.Mock;
  beforeEach(() => {
    jest.clearAllMocks();
    fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'email-1' }) });
    global.fetch = fetchMock as unknown as typeof fetch;
  });
  it('hands the recovery link to the configured sender without making a live send', async () => {
    const values: Record<string, string> = { RESEND_API_KEY: 'test-key', SENDGRID_FROM_EMAIL: 'support@example.test', SENDGRID_FROM_NAME: 'Samnuan' };
    const email = new EmailService({ get: (key: string) => values[key] } as ConfigService);
    await email.sendPasswordResetEmail('recipient@example.test', 'https://samnuan.example/reset-password?token=test-token');
    expect(fetchMock).toHaveBeenCalledWith('https://api.resend.com/emails', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer test-key' }),
    }));
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body).toEqual(expect.objectContaining({
      to: 'recipient@example.test', from: 'Samnuan <support@example.test>',
      text: expect.stringContaining('https://samnuan.example/reset-password?token=test-token'),
      html: expect.stringContaining('Reset password'),
    }));
  });
  it('does not call the provider when email is not configured', async () => {
    const email = new EmailService({ get: () => undefined } as unknown as ConfigService);
    await email.sendPasswordResetEmail('recipient@example.test', 'https://samnuan.example/reset-password?token=test-token');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
