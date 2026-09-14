import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
/** Expo accepts at most 100 messages per request. */
const EXPO_PUSH_CHUNK = 100;

export interface PushMessage {
  title: string;
  body: string;
  /** Deep-link payload the app reads on tap, e.g. { url: '/court-day/<id>' }. */
  data?: Record<string, string>;
}

/**
 * Expo push delivery. Tokens are registered per device from the mobile app;
 * a token that Expo reports as DeviceNotRegistered is pruned so dead devices
 * do not accumulate.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(private prisma: PrismaService) {}

  async register(userId: string, token: string, platform: string) {
    // upsert on token: the device stays one row and follows the last login.
    return this.prisma.deviceToken.upsert({
      where: { token },
      create: { userId, token, platform },
      update: { userId, platform, lastSeenAt: new Date() },
    });
  }

  async unregister(userId: string, token: string) {
    // Scoped to the caller: one user cannot silence another user's device.
    await this.prisma.deviceToken.deleteMany({ where: { token, userId } });
    return { ok: true };
  }

  async sendToUsers(userIds: string[], message: PushMessage): Promise<boolean> {
    if (userIds.length === 0) return false;
    const devices = await this.prisma.deviceToken.findMany({
      where: { userId: { in: userIds } },
    });
    if (devices.length === 0) return false;

    let delivered = false;
    for (let i = 0; i < devices.length; i += EXPO_PUSH_CHUNK) {
      const chunk = devices.slice(i, i + EXPO_PUSH_CHUNK);
      try {
        const res = await fetch(EXPO_PUSH_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            chunk.map((device) => ({
              to: device.token,
              title: message.title,
              body: message.body,
              data: message.data ?? {},
              sound: 'default',
            })),
          ),
        });
        if (!res.ok) {
          this.logger.warn(`Expo push returned HTTP ${res.status}`);
          continue;
        }
        const body = (await res.json()) as {
          data?: Array<{ status: string; details?: { error?: string } }>;
        };
        const tickets = body.data ?? [];
        const deadTokens = chunk
          .filter((_, idx) => tickets[idx]?.details?.error === 'DeviceNotRegistered')
          .map((device) => device.token);
        if (deadTokens.length > 0) {
          await this.prisma.deviceToken.deleteMany({
            where: { token: { in: deadTokens } },
          });
        }
        if (tickets.some((ticket) => ticket.status === 'ok')) delivered = true;
      } catch (error) {
        this.logger.warn(`Expo push failed: ${(error as Error).message}`);
      }
    }
    return delivered;
  }
}
