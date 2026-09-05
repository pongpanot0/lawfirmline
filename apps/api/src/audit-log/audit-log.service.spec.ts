import { Test, TestingModule } from '@nestjs/testing';
import { AuditLogService } from './audit-log.service';
import { PrismaService } from '../prisma/prisma.module';

describe('AuditLogService', () => {
  let service: AuditLogService;
  const mockPrisma = {
    auditLog: { findMany: jest.fn(), count: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [AuditLogService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get(AuditLogService);
  });

  it('lists entries scoped to the given firm, most recent first', async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([{ id: 'log-1' }]);
    mockPrisma.auditLog.count.mockResolvedValue(1);

    const result = await service.list('firm-1', {});

    expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { firmId: 'firm-1' },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    );
    expect(result).toEqual({ items: [{ id: 'log-1' }], total: 1 });
  });

  it('filters by action when provided', async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([]);
    mockPrisma.auditLog.count.mockResolvedValue(0);

    await service.list('firm-1', { action: 'DOCUMENT_READ' });

    expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { firmId: 'firm-1', action: 'DOCUMENT_READ' } }),
    );
  });

  it('filters by userId when provided', async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([]);
    mockPrisma.auditLog.count.mockResolvedValue(0);

    await service.list('firm-1', { userId: 'user-1' });

    expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { firmId: 'firm-1', userId: 'user-1' } }),
    );
  });

  it('caps limit at 200 even when a larger value is requested', async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([]);
    mockPrisma.auditLog.count.mockResolvedValue(0);

    await service.list('firm-1', { limit: 9999 });

    expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 200 }),
    );
  });
});
