import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException, ValidationPipe } from '@nestjs/common';
import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { FirmRole, PaperFileAction } from '@lawfirm/shared';
import { PaperFilesService } from './paper-files.service';
import { PaperFilesController, PaperFileActionDto, CheckedOutQueryDto } from './paper-files.controller';
import { PrismaService } from '../prisma/prisma.service';
import { CaseAccessService } from '../common/services/case-access.service';
import { CaseAccessGuard } from '../common/guards/case-access.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { FirmRoleGuard } from '../saas/guards/firm-role.guard';
import { REQUIRE_CAPABILITY_KEY } from '../saas/decorators/saas.decorators';

const NOW = new Date('2026-10-31T03:00:00.000Z');

describe('PaperFilesService', () => {
  let service: PaperFilesService;
  const user = { id: 'u-1', firmId: 'firm-1', firmRole: FirmRole.LAWYER } as any;
  const manager = { ...user, firmRole: FirmRole.OFFICE_MANAGER };
  const stored = {
    id: 'case-1', folderId: 'LF-2569-ABC123',
    paperFileHolderId: null, paperFileLocation: 'ตู้ A ชั้น 2', paperFileHolder: null,
  };
  const mockTx = {
    case: { findFirst: jest.fn(), update: jest.fn() },
    firmMember: { count: jest.fn() },
    paperFileMovement: { create: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  const mockPrisma = {
    case: { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    paperFileMovement: { findMany: jest.fn(), groupBy: jest.fn() },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    jest.spyOn(Date, 'now').mockReturnValue(NOW.getTime());
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockTx) => unknown) => cb(mockTx));
    mockTx.case.findFirst.mockResolvedValue(stored);
    mockTx.case.update.mockResolvedValue(stored);
    mockTx.firmMember.count.mockResolvedValue(1);
    mockPrisma.case.findFirst.mockResolvedValue(stored);
    mockPrisma.case.findMany.mockResolvedValue([]);
    mockPrisma.case.count.mockResolvedValue(0);
    mockPrisma.paperFileMovement.findMany.mockResolvedValue([]);
    mockPrisma.paperFileMovement.groupBy.mockResolvedValue([]);
    const module = await Test.createTestingModule({
      providers: [PaperFilesService, CaseAccessService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get(PaperFilesService);
  });

  afterEach(() => jest.restoreAllMocks());

  it('checks out to the selected member, records the movement and audits in one transaction', async () => {
    await service.checkOut(user, 'case-1', { holderUserId: 'u-2', note: 'ไปศาล' });
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockTx.firmMember.count).toHaveBeenCalledWith({
      where: { firmId: 'firm-1', userId: { in: ['u-2'] }, role: { notIn: [FirmRole.EXTERNAL] } },
    });
    expect(mockTx.case.update).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'case-1', firmId: 'firm-1' }),
      data: { paperFileHolderId: 'u-2', paperFileLocation: null },
    }));
    expect(mockTx.paperFileMovement.create).toHaveBeenCalledWith({ data: {
      firmId: 'firm-1', caseId: 'case-1', action: PaperFileAction.CHECK_OUT,
      holderUserId: 'u-2', location: null, note: 'ไปศาล', createdById: 'u-1',
    } });
    expect(mockTx.auditLog.create).toHaveBeenCalledWith({ data: {
      firmId: 'firm-1', userId: 'u-1', action: 'PAPER_FILE_CHECK_OUT',
      metadata: { caseId: 'case-1', holderUserId: 'u-2', location: null, note: 'ไปศาล' },
    } });
  });

  it('defaults the holder to the current user and validates that membership too', async () => {
    await service.checkOut(user, 'case-1', {});
    expect(mockTx.firmMember.count).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ firmId: 'firm-1', userId: { in: ['u-1'] } }),
    }));
    expect(mockTx.case.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { paperFileHolderId: 'u-1', paperFileLocation: null },
    }));
  });

  it('rejects a holder from another firm before writing anything', async () => {
    mockTx.firmMember.count.mockResolvedValue(0);
    await expect(service.checkOut(user, 'case-1', { holderUserId: 'other-firm-user' }))
      .rejects.toThrow(BadRequestException);
    expect(mockTx.case.update).not.toHaveBeenCalled();
    expect(mockTx.paperFileMovement.create).not.toHaveBeenCalled();
    expect(mockTx.auditLog.create).not.toHaveBeenCalled();
  });

  it('checks in with a trimmed location, clears the holder and audits the return', async () => {
    mockTx.case.findFirst.mockResolvedValue({ ...stored, paperFileHolderId: 'u-2' });
    await service.checkIn(user, 'case-1', { location: ' ตู้ B ', note: 'คืนแล้ว' });
    expect(mockTx.case.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { paperFileHolderId: null, paperFileLocation: 'ตู้ B' },
    }));
    expect(mockTx.paperFileMovement.create).toHaveBeenCalledWith({ data: {
      firmId: 'firm-1', caseId: 'case-1', action: PaperFileAction.CHECK_IN,
      holderUserId: null, location: 'ตู้ B', note: 'คืนแล้ว', createdById: 'u-1',
    } });
    expect(mockTx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data:
      expect.objectContaining({ firmId: 'firm-1', userId: 'u-1', action: 'PAPER_FILE_CHECK_IN' }),
    }));
  });

  it.each([undefined, '', '   '])('requires a location to check in (%s)', async (location) => {
    await expect(service.checkIn(user, 'case-1', { location } as any)).rejects.toThrow(BadRequestException);
    expect(mockTx.case.update).not.toHaveBeenCalled();
  });

  it('moves a stored file, keeps the holder null and audits the move', async () => {
    await service.move(user, 'case-1', { location: 'ตู้ C' });
    expect(mockTx.case.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { paperFileHolderId: null, paperFileLocation: 'ตู้ C' },
    }));
    expect(mockTx.paperFileMovement.create).toHaveBeenCalledWith({ data: {
      firmId: 'firm-1', caseId: 'case-1', action: PaperFileAction.MOVE,
      holderUserId: null, location: 'ตู้ C', note: null, createdById: 'u-1',
    } });
    expect(mockTx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data:
      expect.objectContaining({ firmId: 'firm-1', userId: 'u-1', action: 'PAPER_FILE_MOVE' }),
    }));
  });

  it('requires a location to move a stored file', async () => {
    await expect(service.move(user, 'case-1', { location: ' ' })).rejects.toThrow(BadRequestException);
    expect(mockTx.case.update).not.toHaveBeenCalled();
  });

  it('rejects a storage move while a file is checked out', async () => {
    mockTx.case.findFirst.mockResolvedValue({ ...stored, paperFileHolderId: 'u-2' });
    await expect(service.move(user, 'case-1', { location: 'ตู้ C' })).rejects.toThrow(BadRequestException);
    expect(mockTx.case.update).not.toHaveBeenCalled();
  });

  it('rejects writes for an inaccessible or other-firm case', async () => {
    mockTx.case.findFirst.mockResolvedValue(null);
    await expect(service.checkOut(user, 'hidden-case', {})).rejects.toThrow(NotFoundException);
    expect(mockTx.case.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where:
      expect.objectContaining({ id: 'hidden-case', firmId: 'firm-1', AND:
        expect.objectContaining({ firmId: 'firm-1', deletedAt: null, OR: expect.any(Array) }),
      }),
    }));
    expect(mockTx.case.update).not.toHaveBeenCalled();
  });

  it('propagates audit failures out of the transaction', async () => {
    mockTx.auditLog.create.mockRejectedValue(new Error('audit unavailable'));
    await expect(service.checkOut(user, 'case-1', {})).rejects.toThrow('audit unavailable');
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('returns state and the ten latest tenant-scoped movements', async () => {
    const movement = { id: 'm-1', action: PaperFileAction.MOVE };
    mockPrisma.paperFileMovement.findMany.mockResolvedValue([movement]);
    const result = await service.history(user, 'case-1');
    expect(result).toEqual({ ...stored, history: [movement] });
    expect(mockPrisma.case.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where:
      expect.objectContaining({ id: 'case-1', firmId: 'firm-1', AND: expect.any(Object) }),
    }));
    expect(mockPrisma.paperFileMovement.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { firmId: 'firm-1', caseId: 'case-1' }, take: 10,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    }));
    await service.history(user, 'case-1', 3);
    expect(mockPrisma.paperFileMovement.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ take: 3 }));
  });

  it('does not load movements when the case is inaccessible', async () => {
    mockPrisma.case.findFirst.mockResolvedValue(null);
    await expect(service.history(user, 'hidden-case')).rejects.toThrow(NotFoundException);
    expect(mockPrisma.paperFileMovement.findMany).not.toHaveBeenCalled();
  });

  it('resolves a folder using the current user case-access filter', async () => {
    mockPrisma.case.findFirst.mockResolvedValue({ id: 'case-1' });
    await expect(service.resolveFolder(user, stored.folderId)).resolves.toEqual({ caseId: 'case-1' });
    expect(mockPrisma.case.findFirst).toHaveBeenCalledWith({
      where: { folderId: stored.folderId, firmId: 'firm-1', AND: expect.objectContaining({
        firmId: 'firm-1', deletedAt: null, OR: expect.arrayContaining([{ leadLawyerId: 'u-1' }]),
      }) },
      select: { id: true },
    });
  });

  it('returns NotFound for another firm folder or an unassigned same-firm folder', async () => {
    mockPrisma.case.findFirst.mockResolvedValue(null);
    await expect(service.resolveFolder(user, 'foreign-folder')).rejects.toThrow(NotFoundException);
  });

  it('paginates by the latest checkout per case, oldest first, and computes daysOut', async () => {
    const oldest = new Date('2026-10-20T03:00:00.000Z');
    const newer = new Date('2026-10-30T15:00:00.000Z');
    mockPrisma.case.count.mockResolvedValue(5);
    mockPrisma.paperFileMovement.groupBy.mockResolvedValue([
      { caseId: 'case-1', _max: { createdAt: oldest } },
      { caseId: 'case-2', _max: { createdAt: newer } },
    ]);
    mockPrisma.case.findMany.mockResolvedValue([
      { ...stored, id: 'case-2', paperFileHolderId: 'u-2' },
      { ...stored, paperFileHolderId: 'u-1' },
    ]);
    const result = await service.listCheckedOut(manager, { page: 2, pageSize: 2 });
    expect(mockPrisma.paperFileMovement.groupBy).toHaveBeenCalledWith({
      by: ['caseId'],
      where: { firmId: 'firm-1', action: PaperFileAction.CHECK_OUT,
        case: { firmId: 'firm-1', deletedAt: null, paperFileHolderId: { not: null } } },
      _max: { createdAt: true },
      orderBy: [{ _max: { createdAt: 'asc' } }, { caseId: 'asc' }],
      skip: 2, take: 2,
    });
    expect(mockPrisma.case.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {
      id: { in: ['case-1', 'case-2'] }, firmId: 'firm-1', deletedAt: null,
      paperFileHolderId: { not: null },
    } }));
    expect(mockPrisma.case.count).toHaveBeenCalledWith({ where: {
      firmId: 'firm-1', deletedAt: null, paperFileHolderId: { not: null },
    } });
    expect(result).toMatchObject({ total: 5, page: 2, pageSize: 2, items: [
      { id: 'case-1', checkedOutAt: oldest, daysOut: 11 },
      { id: 'case-2', checkedOutAt: newer, daysOut: 0 },
    ] });
  });

  it('defaults to 50 rows and returns an empty page without fetching case details', async () => {
    await expect(service.listCheckedOut(manager, { page: 1 })).resolves.toEqual({
      items: [], total: 0, page: 1, pageSize: 50,
    });
    expect(mockPrisma.paperFileMovement.groupBy).toHaveBeenCalledWith(expect.objectContaining({ skip: 0, take: 50 }));
    expect(mockPrisma.case.findMany).not.toHaveBeenCalled();
  });

  it('rejects operations listing without the capability', async () => {
    await expect(service.listCheckedOut(user, { page: 1 })).rejects.toThrow(ForbiddenException);
    expect(mockPrisma.paperFileMovement.groupBy).not.toHaveBeenCalled();
  });

  it.each([{ page: 0 }, { page: 1.5 }, { page: 1, pageSize: 0 }, { page: 1, pageSize: 101 }])(
    'rejects invalid pagination %j', async (query) => {
      await expect(service.listCheckedOut(manager, query)).rejects.toThrow(BadRequestException);
      expect(mockPrisma.paperFileMovement.groupBy).not.toHaveBeenCalled();
    },
  );
});

describe('PaperFilesController contract', () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });

  it('authenticates all routes, guards case routes and requires runOperations for the list', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, PaperFilesController)).toContain(JwtAuthGuard);
    for (const handler of ['history', 'act'] as const) {
      const method = PaperFilesController.prototype[handler];
      expect(Reflect.getMetadata(PATH_METADATA, method)).toBe('cases/:caseId/paper-file');
      expect(Reflect.getMetadata(GUARDS_METADATA, method)).toContain(CaseAccessGuard);
    }
    expect(Reflect.getMetadata(PATH_METADATA, PaperFilesController.prototype.resolveFolder))
      .toBe('paper-files/by-folder/:folderId');
    const list = PaperFilesController.prototype.listCheckedOut;
    expect(Reflect.getMetadata(PATH_METADATA, list)).toBe('paper-files/checked-out');
    expect(Reflect.getMetadata(GUARDS_METADATA, list)).toContain(FirmRoleGuard);
    expect(Reflect.getMetadata(REQUIRE_CAPABILITY_KEY, list)).toBe('runOperations');
  });

  it.each([
    { action: 'UNKNOWN' }, { action: PaperFileAction.CHECK_OUT, holderUserId: 42 },
    { action: PaperFileAction.CHECK_OUT, holderUserId: '' },
    { action: PaperFileAction.CHECK_IN }, { action: PaperFileAction.CHECK_IN, location: ' ' },
    { action: PaperFileAction.MOVE, location: null }, { action: PaperFileAction.MOVE, location: 42 },
    { action: PaperFileAction.CHECK_OUT, note: 42 },
  ])('validates the movement request %j', async (body) => {
    await expect(pipe.transform(body, { type: 'body', metatype: PaperFileActionDto }))
      .rejects.toThrow(BadRequestException);
  });

  it.each(Object.values(PaperFileAction))('dispatches %s to the service', async (action) => {
    const service = { checkOut: jest.fn(), checkIn: jest.fn(), move: jest.fn() };
    const controller = new PaperFilesController(service as any);
    const body = await pipe.transform({ action, location: 'ตู้ A' }, { type: 'body', metatype: PaperFileActionDto });
    const user = { id: 'u-1', firmId: 'firm-1' } as any;
    controller.act(user, 'case-1', body);
    const method = ({ CHECK_OUT: 'checkOut', CHECK_IN: 'checkIn', MOVE: 'move' } as const)[action];
    expect(service[method]).toHaveBeenCalledWith(user, 'case-1', body);
  });

  it('transforms numeric pagination and rejects malformed or oversized queries', async () => {
    await expect(pipe.transform({ page: '2' }, { type: 'query', metatype: CheckedOutQueryDto }))
      .resolves.toMatchObject({ page: 2, pageSize: 50 });
    for (const query of [{ page: 'x' }, { page: '-1' }, { pageSize: '101' }]) {
      await expect(pipe.transform(query, { type: 'query', metatype: CheckedOutQueryDto }))
        .rejects.toThrow(BadRequestException);
    }
  });
});
