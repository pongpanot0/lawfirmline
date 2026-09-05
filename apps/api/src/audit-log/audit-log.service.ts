import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module';

export interface AuditLogFilters {
  action?: string;
  userId?: string;
  limit?: number;
  cursor?: string;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async list(firmId: string, filters: AuditLogFilters) {
    const where: Record<string, unknown> = { firmId };
    if (filters.action) where.action = filters.action;
    if (filters.userId) where.userId = filters.userId;

    const take = Math.min(filters.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { items, total };
  }
}
