import { Injectable, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.module';

export type ErrorSource = 'api' | 'server' | 'web';

export interface ErrorEntry {
  source: ErrorSource;
  message: string;
  stack?: string | null;
  context?: string | null;
  method?: string | null;
  path?: string | null;
  statusCode?: number | null;
  userId?: string | null;
  firmId?: string | null;
  userAgent?: string | null;
}

export interface ErrorLogQuery {
  source?: ErrorSource;
  status?: 'open' | 'resolved';
  q?: string;
  firmId?: string;
  cursor?: string;
  limit?: number;
}

const RETENTION_DAYS = 90;
const clip = (value: string | null | undefined, max: number) => (value ? value.slice(0, max) : null);

@Injectable()
export class ErrorLogService {
  constructor(private prisma: PrismaService) {}

  /**
   * Never throws and never logs through Nest's Logger: it is called from the
   * logger and the exception filter, so a failure here must not loop back.
   */
  record(entry: ErrorEntry): void {
    // ponytail: one insert per error, no rate limit; add a per-message window if a hot loop floods the table.
    this.prisma.errorLog
      .create({
        data: {
          source: entry.source,
          message: clip(entry.message, 2000) || '(no message)',
          stack: clip(entry.stack, 8000),
          context: clip(entry.context, 200),
          method: clip(entry.method, 10),
          path: clip(entry.path, 500),
          statusCode: entry.statusCode ?? null,
          userId: entry.userId ?? null,
          firmId: entry.firmId ?? null,
          userAgent: clip(entry.userAgent, 300),
        },
      })
      .catch((err: unknown) => process.stderr.write(`ErrorLog write failed: ${String(err)}\n`));
  }

  async list(query: ErrorLogQuery) {
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
    const q = query.q?.trim();
    const where = {
      ...(query.source && { source: query.source }),
      ...(query.firmId && { firmId: query.firmId }),
      ...(query.status === 'open' && { resolvedAt: null }),
      ...(query.status === 'resolved' && { resolvedAt: { not: null } }),
      ...(q && {
        OR: [
          { message: { contains: q, mode: 'insensitive' as const } },
          { path: { contains: q, mode: 'insensitive' as const } },
          { context: { contains: q, mode: 'insensitive' as const } },
        ],
      }),
    };
    const [items, total] = await Promise.all([
      this.prisma.errorLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit,
        ...(query.cursor && { cursor: { id: query.cursor }, skip: 1 }),
        // The list stays light; the stack comes with the detail call.
        omit: { stack: true },
      }),
      this.prisma.errorLog.count({ where }),
    ]);
    return { items, total, nextCursor: items.length === limit ? items[items.length - 1].id : null };
  }

  async get(id: string) {
    const row = await this.prisma.errorLog.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('ไม่พบ error นี้');
    const firm = row.firmId ? await this.prisma.firm.findUnique({ where: { id: row.firmId }, select: { name: true, slug: true } }) : null;
    const user = row.userId
      ? await this.prisma.user.findUnique({ where: { id: row.userId }, select: { email: true, firstName: true, lastName: true } })
      : null;
    return { ...row, firm, user };
  }

  /** Counts for the dashboard: open errors overall and per source in the last 24h. */
  async summary() {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [open, last24h] = await Promise.all([
      this.prisma.errorLog.count({ where: { resolvedAt: null } }),
      this.prisma.errorLog.groupBy({ by: ['source'], where: { createdAt: { gte: since } }, _count: { _all: true } }),
    ]);
    return { open, last24h: Object.fromEntries(last24h.map((row) => [row.source, row._count._all])) };
  }

  async setResolved(ids: string[], resolved: boolean, by: string) {
    const { count } = await this.prisma.errorLog.updateMany({
      where: { id: { in: ids } },
      data: resolved ? { resolvedAt: new Date(), resolvedBy: by } : { resolvedAt: null, resolvedBy: null },
    });
    return { updated: count };
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM, { timeZone: 'Asia/Bangkok' })
  async purgeOld() {
    const before = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    await this.prisma.errorLog.deleteMany({ where: { createdAt: { lt: before } } });
  }
}
