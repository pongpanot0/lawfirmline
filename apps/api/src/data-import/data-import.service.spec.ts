import * as ExcelJS from 'exceljs';
import { BadRequestException, ConflictException, ForbiddenException, Logger, NotFoundException } from '@nestjs/common';
import { AuthUser, FirmRole, Role } from '@lawfirm/shared';
import { DataImportService, DATA_IMPORT_MAX_BYTES } from './data-import.service';
import type { ImportDraft, RegisteredImportKind } from './import-kind';
import { assertFirmRefs } from '../common/firm-refs';
import { DataImportMemberGuard } from './data-import-member.guard';
import { Prisma } from '../generated/prisma';

jest.mock('../common/firm-refs', () => ({ assertFirmRefs: jest.fn() }));

const user = { id: 'user-1', firmId: 'firm-1', firmRole: FirmRole.OWNER, role: Role.ADMIN } as AuthUser;
const draft: ImportDraft = { rowNumber: 2, problems: [], cells: { name: 'ลูกความ' }, refs: { userIds: ['user-1'], clientIds: ['client-1'] } };

async function sheet(value: ExcelJS.CellValue = 'ลูกความ') {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('ลูกความ');
  sheet.addRow(['name']); sheet.addRow([value]);
  const buffer = Buffer.from(await book.xlsx.writeBuffer());
  return { buffer, size: buffer.length, originalname: 'clients.xlsx' };
}

describe('DataImportService atomic commit', () => {
  let service: DataImportService;
  let def: RegisteredImportKind;
  let prisma: any;
  let tx: any;
  let batch: any;

  beforeEach(() => {
    jest.clearAllMocks();
    batch = { id: 'batch-1', kind: 'clients', firmId: user.firmId, createdById: user.id, status: 'PREVIEW', rows: [{ rowNumber: 2, values: { name: 'ลูกความ' } }], ledger: null };
    tx = {
      $queryRaw: jest.fn(),
      dataImportBatch: { findFirst: jest.fn(({ where }) => {
        if (where.firmId !== batch.firmId || where.createdById !== batch.createdById || batch.kind === where.kind.not) return null;
        return batch;
      }), update: jest.fn() },
      auditLog: { create: jest.fn() },
      client: { create: jest.fn() },
    };
    prisma = {
      $transaction: jest.fn((callback) => callback(tx)),
      dataImportBatch: { create: jest.fn().mockResolvedValue({ id: 'batch-1' }) },
    };
    def = {
      kind: 'clients', label: 'ลูกความ', sheet: 'ลูกความ', headers: ['name'], required: ['name'], help: { name: 'ชื่อ' },
      canImport: jest.fn().mockReturnValue(true), template: jest.fn().mockReturnValue({}),
      lookups: jest.fn().mockResolvedValue({}), resolve: jest.fn().mockReturnValue([draft]),
      commit: jest.fn().mockResolvedValue({ created: 1 }),
    };
    service = new DataImportService(prisma, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never);
    service['registry'].clear(); service['registry'].set('clients', def);
  });

  it('re-resolves stored rows inside the locked serializable transaction before writing and records audit', async () => {
    await expect(service.commit(user, batch.id)).resolves.toEqual({ batchId: batch.id, kind: 'clients', created: 1 });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable', timeout: 30000 });
    expect(tx.$queryRaw.mock.calls[0][0].join('')).toContain('FOR UPDATE');
    expect(tx.dataImportBatch.findFirst).toHaveBeenCalledWith({ where: {
      id: batch.id, firmId: user.firmId, createdById: user.id, kind: { not: 'SETUP' },
    } });
    expect(def.lookups).toHaveBeenCalledWith(tx, user);
    expect(def.resolve).toHaveBeenCalledWith(batch.rows, {}, user);
    expect(assertFirmRefs).toHaveBeenCalledWith(tx, user.firmId, { userIds: ['user-1'], clientIds: ['client-1'], caseTypeIds: [] });
    expect((assertFirmRefs as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan((def.commit as jest.Mock).mock.invocationCallOrder[0]);
    expect(tx.dataImportBatch.update).toHaveBeenCalledWith({ where: { id: batch.id }, data: { status: 'COMMITTED', committedAt: expect.any(Date), ledger: { created: 1 } } });
    expect(tx.auditLog.create).toHaveBeenCalledWith({ data: { firmId: user.firmId, userId: user.id, action: 'DATA_IMPORTED_CLIENTS', metadata: { batchId: batch.id, kind: 'clients', created: 1 } } });
  });

  it('one problem among good rows rejects the whole batch without any creates', async () => {
    (def.resolve as jest.Mock).mockReturnValue([draft, { ...draft, rowNumber: 3, problems: ['ชื่อลูกความ ซ้ำ'] }]);
    const result = service.commit(user, batch.id);
    await expect(result).rejects.toBeInstanceOf(ConflictException);
    await expect(result).rejects.toMatchObject({ response: { message: 'ข้อมูลเปลี่ยนไปหรือมีแถวที่ต้องแก้ — ตรวจตัวอย่างใหม่', rows: [{ rowNumber: 3, problems: ['ชื่อลูกความ ซ้ำ'] }] } });
    expect(def.commit).not.toHaveBeenCalled();
    expect(tx.client.create).not.toHaveBeenCalled();
    expect(tx.dataImportBatch.update).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it.each(['firmId', 'createdById'])('another %s has no access', async field => {
    batch[field] = 'another';
    await expect(service.commit(user, batch.id)).rejects.toBeInstanceOf(NotFoundException);
    expect(def.commit).not.toHaveBeenCalled();
  });

  it('SETUP batches cannot be committed here', async () => {
    batch.kind = 'SETUP';
    await expect(service.commit(user, batch.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('COMMITTED is idempotent, never re-running lookups, writes or after', async () => {
    batch.status = 'COMMITTED'; batch.ledger = { created: 7 };
    await expect(service.commit(user, batch.id)).resolves.toEqual({ batchId: batch.id, kind: 'clients', created: 7 });
    expect(def.lookups).not.toHaveBeenCalled(); expect(def.commit).not.toHaveBeenCalled();
    expect(tx.dataImportBatch.update).not.toHaveBeenCalled(); expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('a batch that is not PREVIEW or COMMITTED conflicts', async () => {
    batch.status = 'UNDONE';
    await expect(service.commit(user, batch.id)).rejects.toBeInstanceOf(ConflictException);
  });

  it('checks the current gate again before resolving/writing', async () => {
    (def.canImport as jest.Mock).mockReturnValue(false);
    await expect(service.commit(user, batch.id)).rejects.toBeInstanceOf(ForbiddenException);
    expect(def.lookups).not.toHaveBeenCalled(); expect(def.commit).not.toHaveBeenCalled();
  });

  it('a defence-in-depth firm-ref failure prevents all writes', async () => {
    (assertFirmRefs as jest.Mock).mockRejectedValueOnce(new BadRequestException('foreign ref'));
    await expect(service.commit(user, batch.id)).rejects.toBeInstanceOf(BadRequestException);
    expect(def.commit).not.toHaveBeenCalled(); expect(tx.dataImportBatch.update).not.toHaveBeenCalled();
  });

  it('after runs exactly once, only once the transaction has resolved', async () => {
    let resolved = false;
    const after = jest.fn(async () => { expect(resolved).toBe(true); });
    (def.commit as jest.Mock).mockResolvedValue({ created: 1, after });
    prisma.$transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => { const value = await callback(tx); resolved = true; return value; });
    await service.commit(user, batch.id);
    expect(after).toHaveBeenCalledTimes(1);
    batch.status = 'COMMITTED'; batch.ledger = { created: 1 };
    await service.commit(user, batch.id);
    expect(after).toHaveBeenCalledTimes(1);
  });

  it('does not run after if committing the transaction fails', async () => {
    const after = jest.fn();
    (def.commit as jest.Mock).mockResolvedValue({ created: 1, after });
    prisma.$transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => { await callback(tx); throw new Error('rollback'); });
    await expect(service.commit(user, batch.id)).rejects.toThrow('rollback');
    expect(after).not.toHaveBeenCalled();
  });

  it.each(['P2034', 'P2002'])('returns a retryable 409 for a concurrent database conflict (%s)', async code => {
    prisma.$transaction.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('conflict', { code, clientVersion: '6' }));
    await expect(service.commit(user, batch.id)).rejects.toMatchObject({ response: { message: 'ข้อมูลเปลี่ยนไปหรือมีแถวที่ต้องแก้ — ตรวจตัวอย่างใหม่', rows: [] } });
  });

  it('logs after failures and still returns committed result', async () => {
    const warning = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    (def.commit as jest.Mock).mockResolvedValue({ created: 1, after: jest.fn().mockRejectedValue(new Error('mail failed')) });
    try {
      await expect(service.commit(user, batch.id)).resolves.toEqual({ batchId: batch.id, kind: 'clients', created: 1 });
      expect(warning).toHaveBeenCalledWith(expect.stringContaining('Post-import side effect failed'));
    } finally { warning.mockRestore(); }
  });

  it('an empty stored file cannot commit', async () => {
    (def.resolve as jest.Mock).mockReturnValue([]);
    await expect(service.commit(user, batch.id)).rejects.toBeInstanceOf(ConflictException);
    expect(def.commit).not.toHaveBeenCalled();
  });

  it('preview stores only raw rows and display cells in response; commit restores native Excel date cells', async () => {
    const date = new Date('2026-11-14T00:00:00Z');
    const response = await service.preview(user, 'clients', await sheet(date));
    expect(response).toEqual({ batchId: batch.id, kind: 'clients', columns: [{ key: 'name', label: 'name' }], rows: [{ rowNumber: 2, problems: [], cells: { name: 'ลูกความ' } }], total: 1, problemRows: 0, canCommit: true });
    const stored = prisma.dataImportBatch.create.mock.calls[0][0].data;
    expect(stored).toMatchObject({ kind: 'clients', firmId: user.firmId, createdById: user.id, status: 'PREVIEW', rows: [{ rowNumber: 2, values: { name: date.toISOString() } }] });
    Object.assign(batch, { rows: stored.rows, ledger: stored.ledger });
    await service.commit(user, batch.id);
    expect((def.resolve as jest.Mock).mock.calls[1][0][0].values.name).toEqual(date);
    expect((def.resolve as jest.Mock).mock.calls[1][0][0].values.name).toBeInstanceOf(Date);
  });

  it('preview reports problem row count and disallows empty/problem batches', async () => {
    (def.resolve as jest.Mock).mockReturnValue([draft, { ...draft, rowNumber: 3, problems: ['ผิด'] }]);
    expect(await service.preview(user, 'clients', await sheet())).toMatchObject({ total: 2, problemRows: 1, canCommit: false });
    (def.resolve as jest.Mock).mockReturnValue([]);
    expect(await service.preview(user, 'clients', await sheet())).toMatchObject({ total: 0, problemRows: 0, canCommit: false });
  });

  it('enforces missing file, extension and size before parsing', async () => {
    await expect(service.preview(user, 'clients')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.preview(user, 'clients', { originalname: 'x.csv', buffer: Buffer.alloc(0), size: 0 })).rejects.toThrow('รองรับเฉพาะไฟล์ .xlsx');
    await expect(service.preview(user, 'clients', { originalname: 'x.xlsx', buffer: Buffer.alloc(0), size: DATA_IMPORT_MAX_BYTES + 1 })).rejects.toThrow('ไฟล์ใหญ่เกิน 2 MB');
    await expect(service.preview(user, 'clients', { originalname: 'x.xlsx', buffer: Buffer.alloc(DATA_IMPORT_MAX_BYTES + 1), size: 0 })).rejects.toThrow('ไฟล์ใหญ่เกิน 2 MB');
  });

  it('unknown kinds return 404; denied templates/previews return 403; kinds lists allowed=false', async () => {
    await expect(service.template(user, 'unknown')).rejects.toBeInstanceOf(NotFoundException);
    (def.canImport as jest.Mock).mockReturnValue(false);
    expect(service.kinds(user)).toEqual({ kinds: [{ kind: 'clients', label: 'ลูกความ', allowed: false }] });
    await expect(service.template(user, 'clients')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.preview(user, 'clients')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('EXTERNAL is denied everywhere, including prior to multipart interceptors through the guard', async () => {
    const external = { ...user, firmRole: FirmRole.EXTERNAL };
    expect(() => service.kinds(external)).toThrow(ForbiddenException);
    await expect(service.template(external, 'clients')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.preview(external, 'clients')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.commit(external, batch.id)).rejects.toBeInstanceOf(ForbiddenException);
    const context = { switchToHttp: () => ({ getRequest: () => ({ user: external }) }) };
    expect(() => new DataImportMemberGuard().canActivate(context as never)).toThrow(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('history lists only the firm\'s committed non-setup batches with their importer', async () => {
    prisma.dataImportBatch.findMany = jest.fn().mockResolvedValue([
      { id: 'b1', kind: 'cases', ledger: { created: 3 }, committedAt: new Date('2026-11-14T00:00:00Z'), createdById: 'user-1' },
    ]);
    prisma.user = { findMany: jest.fn().mockResolvedValue([{ id: 'user-1', firstName: 'ก', lastName: 'ข' }]) };
    await expect(service.history(user)).resolves.toEqual({ batches: [
      { id: 'b1', kind: 'cases', total: 3, created: 3, committedAt: new Date('2026-11-14T00:00:00Z'), createdBy: { firstName: 'ก', lastName: 'ข' } },
    ] });
    expect(prisma.dataImportBatch.findMany.mock.calls[0][0].where).toEqual({ firmId: 'firm-1', status: 'COMMITTED', kind: { not: 'SETUP' } });
    await expect(service.history({ ...user, firmRole: FirmRole.EXTERNAL })).rejects.toBeInstanceOf(ForbiddenException);
  });
});
