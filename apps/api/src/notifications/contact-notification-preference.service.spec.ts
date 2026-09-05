import { Test, TestingModule } from '@nestjs/testing';
import { ContactNotificationPreferenceService } from './contact-notification-preference.service';
import { PrismaService } from '../prisma/prisma.module';

describe('ContactNotificationPreferenceService', () => {
  let service: ContactNotificationPreferenceService;
  const mockPrisma = {
    contactNotificationPreference: { findMany: jest.fn(), upsert: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [ContactNotificationPreferenceService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get(ContactNotificationPreferenceService);
  });

  it('getForContact lists preferences for the given contact', async () => {
    mockPrisma.contactNotificationPreference.findMany.mockResolvedValue([
      { channel: 'LINE', isEnabled: true },
    ]);

    const result = await service.getForContact('contact-1');

    expect(mockPrisma.contactNotificationPreference.findMany).toHaveBeenCalledWith({
      where: { clientContactId: 'contact-1' },
      select: { channel: true, isEnabled: true },
    });
    expect(result).toEqual([{ channel: 'LINE', isEnabled: true }]);
  });

  it('setForContact upserts the preference by (clientContactId, channel)', async () => {
    mockPrisma.contactNotificationPreference.upsert.mockResolvedValue({ channel: 'LINE', isEnabled: false });

    const result = await service.setForContact('contact-1', 'LINE', false);

    expect(mockPrisma.contactNotificationPreference.upsert).toHaveBeenCalledWith({
      where: { clientContactId_channel: { clientContactId: 'contact-1', channel: 'LINE' } },
      create: { clientContactId: 'contact-1', channel: 'LINE', isEnabled: false },
      update: { isEnabled: false },
    });
    expect(result).toEqual({ channel: 'LINE', isEnabled: false });
  });

  describe('isChannelEnabled', () => {
    it('defaults to true when no preference row exists', async () => {
      (mockPrisma as any).contactNotificationPreference.findUnique = jest.fn().mockResolvedValue(null);
      const result = await service.isChannelEnabled('contact-1', 'LINE');
      expect(result).toBe(true);
    });

    it('returns the stored value when a preference row exists', async () => {
      (mockPrisma as any).contactNotificationPreference.findUnique = jest.fn().mockResolvedValue({ isEnabled: false });
      const result = await service.isChannelEnabled('contact-1', 'LINE');
      expect(result).toBe(false);
    });
  });
});
