import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EmailService } from './email.service';

describe('EmailService', () => {
  let service: EmailService;
  const config: Record<string, string> = {
    RESEND_API_KEY: 'test-key',
    SENDGRID_FROM_EMAIL: 'noreply@example.com',
  };
  const mockConfig = { get: jest.fn((key: string) => config[key]) };
  let fetchMock: jest.Mock;

  function lastRequestBody() {
    return JSON.parse(fetchMock.mock.calls[0][1].body as string);
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'email-1' }) });
    global.fetch = fetchMock as unknown as typeof fetch;
    const module: TestingModule = await Test.createTestingModule({
      providers: [EmailService, { provide: ConfigService, useValue: mockConfig }],
    }).compile();
    service = module.get(EmailService);
  });

  describe('sendTeamDigestEmail', () => {
    const params = { to: 'owner@example.com', dayLabel: 'จ. 9 พ.ย. 2569', lines: ['สรุปทีม', '<script>bad</script>', '', 'ดูรายละเอียดในแอป: https://app.example/operations'] };
    it('sends the Thai subject, plain lines and escaped HTML with a team link', async () => {
      expect(await service.sendTeamDigestEmail(params)).toBe(true);
      const body = lastRequestBody();
      expect(body.subject).toBe('สรุปทีมประจำวัน (จ. 9 พ.ย. 2569)');
      expect(body.text).toBe(params.lines.join('\n'));
      expect(body.html).toContain('&lt;script&gt;bad&lt;/script&gt;');
      expect(body.html).not.toContain('<script>');
      expect(body.html).toContain(`${service.getAppUrl()}/operations`);
    });
    it('returns false when the provider refuses', async () => {
      fetchMock.mockResolvedValueOnce({ ok: false, status: 422, json: async () => ({ message: 'bad' }) });
      expect(await service.sendTeamDigestEmail(params)).toBe(false);
    });
    it('returns false without a request when email is not configured', async () => {
      const key = config.RESEND_API_KEY;
      delete config.RESEND_API_KEY;
      try {
        const unconfigured = new EmailService(mockConfig as unknown as ConfigService);
        expect(await unconfigured.sendTeamDigestEmail(params)).toBe(false);
        expect(fetchMock).not.toHaveBeenCalled();
      } finally {
        config.RESEND_API_KEY = key;
      }
    });
  });

  describe('sendDocumentPublishedEmail', () => {
    it('escapes HTML in documentTitle so an injected <script> tag is not sent unescaped', async () => {
      await service.sendDocumentPublishedEmail({
        to: 'client@example.com',
        contactName: 'คุณสมชาย',
        firmName: 'สำนักงานกฎหมาย',
        documentTitle: '<script>alert(1)</script>',
        portalUrl: 'https://example.com/portal',
      });

      const body = lastRequestBody();
      expect(body.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
      expect(body.html).not.toContain('<script>alert(1)</script>');
    });
  });

  describe('sendClientPortalMagicLinkEmail', () => {
    it('escapes HTML in contactName and firmName', async () => {
      await service.sendClientPortalMagicLinkEmail({
        to: 'client@example.com',
        contactName: '<b>hi</b>',
        firmName: '<i>firm</i>',
        verifyUrl: 'https://example.com/verify',
        expiresAt: new Date(),
      });

      const body = lastRequestBody();
      expect(body.html).toContain('&lt;b&gt;hi&lt;/b&gt;');
      expect(body.html).toContain('&lt;i&gt;firm&lt;/i&gt;');
      expect(body.html).not.toContain('<b>hi</b>');
    });
  });

  it('posts to the Resend API with the configured API key and from address', async () => {
    await service.sendPasswordResetEmail('user@example.com', 'https://example.com/reset');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer test-key' }),
      }),
    );
    const body = lastRequestBody();
    expect(body.from).toBe('LexFlow <noreply@example.com>');
    expect(body.to).toBe('user@example.com');
  });

  it('throws with the Resend error message when the request fails', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 422, json: async () => ({ message: 'invalid from address' }) });

    await expect(
      service.sendInvitationEmail({
        to: 'user@example.com',
        firmName: 'Firm',
        inviterName: 'Owner',
        inviteUrl: 'https://example.com/invite',
        role: 'LAWYER',
        expiresAt: new Date(),
      }),
    ).rejects.toThrow('Resend error 422: invalid from address');
  });

  it('sendClosingEmail returns false instead of throwing when the provider refuses', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 422, json: async () => ({ message: 'bad' }), text: async () => 'bad' });
    await expect(service.sendClosingEmail({ to: 'a@x.co', subject: 's', bodyText: 'b', firmName: 'f' })).resolves.toBe(false);
  });
});
