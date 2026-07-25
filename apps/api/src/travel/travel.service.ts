import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.module';

export interface TravelResult {
  distanceMeters: number;
  durationSeconds: number;
  mapsUrl: string;
  fromCache: boolean;
  warning?: string;
}

@Injectable()
export class TravelService {
  private readonly logger = new Logger(TravelService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  async getOfficeAddress(firmId?: string): Promise<string> {
    if (firmId) {
      const firm = await this.prisma.firm.findUnique({ where: { id: firmId } });
      if (firm) return firm.officeAddress;
    }
    return 'Bangkok, Thailand';
  }

  async calculateTravel(
    origin: string,
    destination: string,
  ): Promise<TravelResult> {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const cached = await this.prisma.travelLog.findFirst({
      where: {
        origin,
        destination,
        createdAt: { gte: sevenDaysAgo },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (cached) {
      return this.toResult(cached, true);
    }

    const apiKey = this.config.get<string>('GOOGLE_MAPS_API_KEY');
    let distanceMeters = 0;
    let durationSeconds = 0;
    let mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}`;

    if (apiKey) {
      try {
        const url = new URL(
          'https://maps.googleapis.com/maps/api/distancematrix/json',
        );
        url.searchParams.set('origins', origin);
        url.searchParams.set('destinations', destination);
        url.searchParams.set('key', apiKey);
        url.searchParams.set('language', 'th');

        const res = await fetch(url.toString());
        const data = (await res.json()) as {
          rows?: Array<{
            elements?: Array<{
              status: string;
              distance?: { value: number };
              duration?: { value: number };
            }>;
          }>;
        };

        const element = data.rows?.[0]?.elements?.[0];
        if (element?.status === 'OK') {
          distanceMeters = element.distance?.value ?? 0;
          durationSeconds = element.duration?.value ?? 0;
        }
      } catch (err) {
        this.logger.warn('Google Maps API error, using estimate', err);
        distanceMeters = 30000;
        durationSeconds = 3600;
      }
    } else {
      this.logger.warn('GOOGLE_MAPS_API_KEY not set, using estimate');
      distanceMeters = 30000;
      durationSeconds = 3600;
    }

    const log = await this.prisma.travelLog.create({
      data: { origin, destination, distanceMeters, durationSeconds, mapsUrl },
    });

    return this.toResult(log, false);
  }

  private toResult(
    log: {
      distanceMeters: number;
      durationSeconds: number;
      mapsUrl: string | null;
    },
    fromCache: boolean,
  ): TravelResult {
    const warning = this.getTravelWarning(log.distanceMeters, log.durationSeconds);
    return {
      distanceMeters: log.distanceMeters,
      durationSeconds: log.durationSeconds,
      mapsUrl: log.mapsUrl ?? '',
      fromCache,
      warning,
    };
  }

  getTravelWarning(distanceMeters: number, durationSeconds: number): string | undefined {
    const km = distanceMeters / 1000;
    const mins = durationSeconds / 60;
    if (km > 50 || mins > 90) {
      return `Travel warning: ${km.toFixed(1)} km, ~${Math.round(mins)} min`;
    }
    return undefined;
  }
}
