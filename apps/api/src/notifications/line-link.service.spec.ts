import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { LineLinkService } from './line-link.service';
import { PrismaService } from '../prisma/prisma.module';
import { LinkCodeAttemptLimiterService } from './link-code-attempt-limiter.service';

describe('LineLinkService.handleIncomingMessage', () => {
  let service: LineLinkService;
  const mockPrisma = {
    user: { findUnique: jest.fn(), update: jest.fn() },
  };
  const mockConfig = { get: jest.fn() };
  const mockLimiter = { recordAttempt: jest.fn().mockReturnValue(true), reset: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockLimiter.recordAttempt.mockReturnValue(true);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LineLinkService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
        { provide: LinkCodeAttemptLimiterService, useValue: mockLimiter },
      ],
    }).compile();
    service = module.get(LineLinkService);
  });

  it('returns null (not a message) when no staff user matches the code, so the webhook can fall through to contact linking', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const result = await service.handleIncomingMessage('U-line-1', 'LF-ABC123');

    expect(result).toBeNull();
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { lineLinkCode: 'LF-ABC123' },
    });
  });

  it('returns null for text that does not look like a link code, without consuming a rate-limit attempt', async () => {
    const result = await service.handleIncomingMessage('U-line-1', 'hello there');

    expect(result).toBeNull();
    expect(mockLimiter.recordAttempt).not.toHaveBeenCalled();
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('returns the rate-limit message and does not query when the limiter rejects the attempt', async () => {
    mockLimiter.recordAttempt.mockReturnValue(false);

    const result = await service.handleIncomingMessage('U-line-1', 'LF-ABC123');

    expect(result).toContain('พยายามเชื่อมต่อบ่อยเกินไป');
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('returns the generic failure message when a matching staff user is found but the code has expired', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({
      id: 'user-1',
      lineLinkCodeExpiresAt: new Date(Date.now() - 1000),
    });

    const result = await service.handleIncomingMessage('U-line-1', 'LF-ABC123');

    expect(result).toContain('ไม่สามารถเชื่อมต่อได้');
  });
});
