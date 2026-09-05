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
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async list(firmId: string, filters: AuditLogFilters) {
    const where: Record<string, unknown> = { firmId };
    if (filters.action) where.action = filters.action;
    if (filters.userId) where.userId = filters.userId;

    const take = Math.min(filters.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const validCursor = filters.cursor && UUID_PATTERN.test(filters.cursor) ? filters.cursor : undefined;

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        ...(validCursor ? { cursor: { id: validCursor }, skip: 1 } : {}),
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { items, total };
  }
}
