import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.module';

/**
 * Records every automation run (ตอบได้ว่า automation ไหน run / trigger จากอะไร /
 * สร้างอะไร / สำเร็จไหม). Failures here never fail the automation itself.
 */
@Injectable()
export class AutomationLogService {
  private readonly logger = new Logger(AutomationLogService.name);

  constructor(private prisma: PrismaService) {}

  async record(params: {
    firmId: string;
    automation: string;
    trigger?: Record<string, unknown>;
    result?: Record<string, unknown>;
    success?: boolean;
    error?: string;
  }): Promise<void> {
    try {
      await this.prisma.automationLog.create({
        data: {
          firmId: params.firmId,
          automation: params.automation,
          trigger: params.trigger as any,
          result: params.result as any,
          success: params.success ?? true,
          error: params.error,
        },
      });
    } catch (err) {
      this.logger.error(`Failed to record automation log ${params.automation}`, err);
    }
  }

  list(firmId: string, limit = 100) {
    return this.prisma.automationLog.findMany({
      where: { firmId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 200),
    });
  }
}
