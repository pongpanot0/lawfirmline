import { ForbiddenException } from '@nestjs/common';
import { AuthUser, FirmRole, Role } from '@lawfirm/shared';
import { DataImportService } from './data-import.service';
import * as limits from '../common/plan-limits';

describe('DataImportService cases plan limit and writes', () => {
  const user = { id: 'u1', firmId: 'f1', role: Role.ADMIN, firmRole: FirmRole.OWNER } as AuthUser;
  let service: DataImportService;
  let prisma: any;
  let tx: any;
  let cases: any;
  let plan: jest.SpyInstance;
  let order: string[];

  beforeEach(() => {
    order = [];
    const rows = [false, false, true].map((closed, index) => ({ rowNumber: index + 2, values: {
      'ชื่อคดี *': `คดี ${index + 1}`, 'ทนายหลัก (อีเมล) *': 'lawyer@firm.co', 'ชั้นศาล *': 'ศาลชั้นต้น',
      เลขอ้างอิงภายใน: `REF-${index + 1}`, ...(closed ? { สถานะ: 'ปิดแล้ว', ผลคดี: 'ชนะคดี', สรุปตอนปิด: 'ชนะคดีตามคำพิพากษา' } : {}),
    } }));
    tx = {
      $queryRaw: jest.fn(),
      dataImportBatch: { findFirst: jest.fn().mockResolvedValue({ id: 'b1', kind: 'cases', status: 'PREVIEW', rows, ledger: null }), update: jest.fn() },
      user: { findMany: jest.fn().mockResolvedValue([{ id: 'u1', email: 'lawyer@firm.co', firstName: 'ทนาย', lastName: 'หนึ่ง' }]) },
      firmMember: { findMany: jest.fn().mockResolvedValue([{ userId: 'u1', role: FirmRole.OWNER, defaultHourlyRate: null, user: { email: 'lawyer@firm.co', firstName: 'ทนาย', lastName: 'หนึ่ง' } }]), count: jest.fn().mockResolvedValue(1) },
      client: { findMany: jest.fn().mockResolvedValue([]) }, caseType: { findMany: jest.fn().mockResolvedValue([]) },
      case: { findMany: jest.fn().mockResolvedValue([]) }, caseProceeding: { findMany: jest.fn().mockResolvedValue([]) },
      auditLog: { create: jest.fn() },
    };
    prisma = { $transaction: jest.fn((callback: (db: unknown) => unknown) => callback(tx)) };
    cases = { createForImport: jest.fn(async () => { order.push('create'); return { id: 'case-id', ownRef: 'REF' }; }) };
    service = new DataImportService(prisma, cases, {} as never, {} as never, {} as never, {} as never, {} as never);
    plan = jest.spyOn(limits, 'assertCanOpenCases').mockImplementation(async (_db, _firm, count) => { order.push(`plan:${count}`); });
  });
  afterEach(() => plan.mockRestore());

  it('runs one aggregate preflight before shared case writers; every row uses the outer transaction', async () => {
    await expect(service.commit(user, 'b1')).resolves.toEqual({ batchId: 'b1', kind: 'cases', created: 3 });
    expect(plan).toHaveBeenCalledTimes(1); expect(plan).toHaveBeenCalledWith(tx, user.firmId, 2);
    expect(order).toEqual(['plan:2', 'create', 'create', 'create']);
    expect(cases.createForImport).toHaveBeenCalledTimes(3);
    for (const call of cases.createForImport.mock.calls) { expect(call[0]).toBe(tx); expect(call[1]).toBe(user); }
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('a plan rejection prevents the first case and the batch/audit writes', async () => {
    plan.mockRejectedValue(new ForbiddenException('plan limit'));
    await expect(service.commit(user, 'b1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(cases.createForImport).not.toHaveBeenCalled(); expect(tx.dataImportBatch.update).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });
});
