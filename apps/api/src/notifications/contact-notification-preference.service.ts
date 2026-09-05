import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module';

@Injectable()
export class ContactNotificationPreferenceService {
  constructor(private readonly prisma: PrismaService) {}

  async getForContact(clientContactId: string) {
    return this.prisma.contactNotificationPreference.findMany({
      where: { clientContactId },
      select: { channel: true, isEnabled: true },
    });
  }

  async setForContact(clientContactId: string, channel: 'EMAIL' | 'LINE', isEnabled: boolean) {
    return this.prisma.contactNotificationPreference.upsert({
      where: { clientContactId_channel: { clientContactId, channel } },
      create: { clientContactId, channel, isEnabled },
      update: { isEnabled },
    });
  }

  async isChannelEnabled(clientContactId: string, channel: 'EMAIL' | 'LINE'): Promise<boolean> {
    const pref = await this.prisma.contactNotificationPreference.findUnique({
      where: { clientContactId_channel: { clientContactId, channel } },
    });
    return pref ? pref.isEnabled : true;
  }
}
