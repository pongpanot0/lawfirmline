import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as sgMail from '@sendgrid/mail';
import { EmailService } from './email.service';

jest.mock('@sendgrid/mail', () => ({
  setApiKey: jest.fn(),
  send: jest.fn(),
}));

describe('EmailService', () => {
  let service: EmailService;
  const config: Record<string, string> = {
    SENDGRID_API_KEY: 'test-key',
    SENDGRID_FROM_EMAIL: 'noreply@example.com',
  };
  const mockConfig = { get: jest.fn((key: string) => config[key]) };

  beforeEach(async () => {
    jest.clearAllMocks();
    (sgMail.send as jest.Mock).mockResolvedValue(undefined);
    const module: TestingModule = await Test.createTestingModule({
      providers: [EmailService, { provide: ConfigService, useValue: mockConfig }],
    }).compile();
    service = module.get(EmailService);
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

      const call = (sgMail.send as jest.Mock).mock.calls[0][0];
      expect(call.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
      expect(call.html).not.toContain('<script>alert(1)</script>');
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

      const call = (sgMail.send as jest.Mock).mock.calls[0][0];
      expect(call.html).toContain('&lt;b&gt;hi&lt;/b&gt;');
      expect(call.html).toContain('&lt;i&gt;firm&lt;/i&gt;');
      expect(call.html).not.toContain('<b>hi</b>');
    });
  });
});
