import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { LineLinkService } from './line-link.service';
import { PrismaService } from '../prisma/prisma.module';
import { LinkCodeAttemptLimiterService } from './link-code-attempt-limiter.service';

describe('LineLinkService.handleIncomingMessage', () => {
  let service: LineLinkService;
  const mockPrisma = {
    user: { findUnique: jest.fn(), update: jest.fn((args) => args) },
    $transaction: jest.fn(async (ops: unknown[]) => ops),
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

  it('moves a LINE account from a stale linked user to the user whose fresh code it sent', async () => {
    mockPrisma.user.findUnique
      .mockResolvedValueOnce({ id: 'stale-user' })
      .mockResolvedValueOnce({ id: 'user-1', firstName: 'Somchai', lineLinkCodeExpiresAt: new Date(Date.now() + 60_000) });

    const result = await service.handleIncomingMessage('U-line-1', 'lf-eeac12');

    expect(result).toContain('เชื่อมต่อสำเร็จ');
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'stale-user' },
      data: { lineUserId: null, lineConnectedAt: null },
    });
    expect(mockPrisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'user-1' },
      data: expect.objectContaining({ lineUserId: 'U-line-1', lineLinkCode: null }),
    }));
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('answers an unknown code from an already-linked LINE account instead of falling through', async () => {
    mockPrisma.user.findUnique
      .mockResolvedValueOnce({ id: 'admin-1' })
      .mockResolvedValueOnce(null);

    const result = await service.handleIncomingMessage('U-line-1', 'LF-XXXXXX');

    expect(result).toContain('รหัสไม่ถูกต้องหรือหมดอายุ');
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('returns the rate-limit message and does not look up a code when the limiter rejects the attempt', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockLimiter.recordAttempt.mockReturnValue(false);

    const result = await service.handleIncomingMessage('U-line-1', 'LF-ABC123');

    expect(result).toContain('พยายามเชื่อมต่อบ่อยเกินไป');
    expect(mockPrisma.user.findUnique).toHaveBeenCalledTimes(1);
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { lineUserId: 'U-line-1' },
      select: { id: true },
    });
  });

  it('returns the generic failure message when a matching staff user is found but the code has expired', async () => {
    mockPrisma.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'user-1',
        lineLinkCodeExpiresAt: new Date(Date.now() - 1000),
      });

    const result = await service.handleIncomingMessage('U-line-1', 'LF-ABC123');

    expect(result).toContain('รหัสไม่ถูกต้องหรือหมดอายุ');
  });
});
