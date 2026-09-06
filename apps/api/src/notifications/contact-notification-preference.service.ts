import { Injectable } from '@nestjs/common';
import { NotificationChannel } from '../generated/prisma';
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

  async setForContact(clientContactId: string, channel: NotificationChannel, isEnabled: boolean) {
    return this.prisma.contactNotificationPreference.upsert({
      where: { clientContactId_channel: { clientContactId, channel } },
      create: { clientContactId, channel, isEnabled },
      update: { isEnabled },
    });
  }

  async isChannelEnabled(clientContactId: string, channel: NotificationChannel): Promise<boolean> {
    const pref = await this.prisma.contactNotificationPreference.findUnique({
      where: { clientContactId_channel: { clientContactId, channel } },
    });
    return pref ? pref.isEnabled : true;
  }

  async getEnabledMap(
    clientContactIds: string[],
    channel: NotificationChannel,
  ): Promise<Map<string, boolean>> {
    const prefs = await this.prisma.contactNotificationPreference.findMany({
      where: { clientContactId: { in: clientContactIds }, channel },
      select: { clientContactId: true, isEnabled: true },
    });
    const map = new Map<string, boolean>(clientContactIds.map((id) => [id, true]));
    for (const pref of prefs) {
      map.set(pref.clientContactId, pref.isEnabled);
    }
    return map;
  }
}
