import * as ExcelJS from 'exceljs';
import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { AuthUser } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { CasesService } from '../cases/cases.service';
import { CASE_IMPORT_HEADERS, CASE_IMPORT_SHEET } from './case-import-columns';
import { CaseImportService } from './case-import.service';
import * as planLimits from '../common/plan-limits';

async function sheet(rows: unknown[][]) {
  const book = new ExcelJS.Workbook();
  const s = book.addWorksheet(CASE_IMPORT_SHEET);
  s.addRow([...CASE_IMPORT_HEADERS]);
  rows.forEach((r) => s.addRow(r));
  const buffer = Buffer.from(await book.xlsx.writeBuffer());
  return { buffer, size: buffer.length, originalname: 'cases.xlsx' };
}

describe('CaseImportService', () => {
  const user = { id: 'u1', firmId: 'f1', firmRole: 'LAWYER' } as unknown as AuthUser;
  let service: CaseImportService;
  const cases = { createForImport: jest.fn() };
  let planCheck: jest.SpyInstance;
  const prisma: any = {
    user: { findMany: jest.fn() },
    firmMember: { findMany: jest.fn(), count: jest.fn() },
    client: { findMany: jest.fn() },
    caseType: { findMany: jest.fn() },
    case: { findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    caseProceeding: { findMany: jest.fn() },
    auditLog: { create: jest.fn() },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.user.findMany.mockResolvedValue([{ id: 'u-anan', email: 'anan@firm.co', firstName: 'Anan', lastName: 'B' }]);
    prisma.firmMember.findMany.mockResolvedValue([{ userId: 'u-anan', user: { email: 'anan@firm.co' } }]);
    prisma.client.findMany.mockResolvedValue([{ id: 'c1', name: 'ACME' }]);
    prisma.caseType.findMany.mockResolvedValue([{ id: 't1', name: 'คดีแพ่ง' }]);
    prisma.case.findMany.mockResolvedValue([{ ownRef: 'TSB-1', blackCaseNumber: 'พ1/2569', courtName: 'ศาลแพ่ง' }]);
    prisma.caseProceeding.findMany.mockResolvedValue([{ blackCaseNumber: 'พ2/2569', courtName: null, case: { ownRef: 'TSB-2' } }]);
    prisma.firmMember.count.mockResolvedValue(1);
    prisma.$transaction.mockImplementation((cb: (tx: unknown) => unknown) => cb('TX'));
    cases.createForImport.mockImplementation((_tx: unknown, _u: unknown, p: any) => ({ id: `case-${p.title}`, ownRef: `REF-${p.title}` }));
    planCheck = jest.spyOn(planLimits, 'assertCanOpenCases').mockResolvedValue(undefined);
    const module = await Test.createTestingModule({
      providers: [
        CaseImportService,
        { provide: PrismaService, useValue: prisma },
        { provide: CasesService, useValue: cases },
      ],
    }).compile();
    service = module.get(CaseImportService);
  });

  it("resolves lookups only inside the caller's firm", async () => {
    await service.preview(user, await sheet([['คดี A', 'anan@firm.co', 'ศาลชั้นต้น']]));
    const wheres = [
      prisma.user.findMany, prisma.firmMember.findMany, prisma.client.findMany,
      prisma.caseType.findMany, prisma.case.findMany, prisma.caseProceeding.findMany,
    ].map((fn) => JSON.stringify(fn.mock.calls[0][0].where));
    for (const where of wheres) expect(where).toContain('"firmId":"f1"');
  });

  it('returns drafts, flags duplicates from cases and proceedings, and counts rows with no key', async () => {
    const { drafts, noKeyRows } = await service.preview(user, await sheet([
      ['คดี A', 'anan@firm.co', 'ศาลชั้นต้น', '', '', '', 'acme', '', '', 'คดีแพ่ง', 'ศาลแพ่ง', 'พ1/2569'],
      ['คดี B', 'anan@firm.co', 'ศาลชั้นต้น', '', '', '', '', '', '', '', 'ศาลอาญา', 'พ2/2569'],
      ['คดี C', 'anan@firm.co', 'ศาลชั้นต้น'],
    ]));
    expect(drafts[0]).toMatchObject({ clientId: 'c1', caseTypeId: 't1', leadLawyerId: 'u-anan', problems: ['มีคดีนี้ในระบบแล้ว (TSB-1)'] });
    expect(drafts[1].problems).toEqual(['มีคดีนี้ในระบบแล้ว (TSB-2)']);
    expect(drafts[2].problems).toEqual([]);
    expect(noKeyRows).toBe(1);
  });

  it("judges 'today' on the Bangkok calendar, not UTC", async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] }).setSystemTime(new Date('2026-10-31T18:30:00Z')); // 01:30 on 1 Nov in Bangkok
    try {
      const { drafts } = await service.preview(user, await sheet([
        ['คดี A', 'anan@firm.co', 'ศาลชั้นต้น', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '01/11/2569'],
      ]));
      expect(drafts[0].problems).toEqual([]);
    } finally {
      jest.useRealTimers();
    }
  });

  it('preview creates nothing', async () => {
    await service.preview(user, await sheet([['คดี A', 'anan@firm.co', 'ศาลชั้นต้น']]));
    expect(prisma.case.create).not.toHaveBeenCalled();
    expect(prisma.case.update).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a file that is not .xlsx or too big', async () => {
    const file = await sheet([]);
    await expect(service.preview(user, { ...file, originalname: 'cases.csv' })).rejects.toThrow(new BadRequestException('รองรับเฉพาะไฟล์ .xlsx'));
    await expect(service.preview(user, { ...file, size: 3 * 1024 * 1024 })).rejects.toThrow('ไฟล์ใหญ่เกิน 2 MB');
  });

  it("builds the template from the firm's case types and lawyers", async () => {
    const buf = await service.template(user);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(buf as unknown as ExcelJS.Buffer);
    const values: unknown[] = [];
    book.getWorksheet('วิธีกรอก')!.eachRow((r) => r.eachCell((c) => values.push(c.value)));
    expect(values).toContain('anan@firm.co');
    expect(JSON.stringify(prisma.caseType.findMany.mock.calls[0][0].where)).toContain('"isActive":true');
  });

  describe('createCases', () => {
    const row = (title: string, extra: Record<string, unknown> = {}) => ({
      rowNumber: 2, title, leadLawyerId: 'u-anan', buddyIds: [], courtLevel: 'TRIAL', opponents: [], closed: false, ...extra,
    });

    it('creates one case per row, each in its own transaction, mapping dates and closed fields', async () => {
      const { results } = await service.createCases(user, { rows: [
        row('A', { openedAt: '2026-02-15', limitationDeadline: '2027-12-01', opponents: ['X'] }),
        row('B', { rowNumber: 3, closed: true, outcome: 'WON', closingSummary: 'ชนะคดีเรียบร้อยแล้ว', closedAt: '2025-09-30' }),
      ] } as any);

      expect(results).toEqual([
        { rowNumber: 2, status: 'CREATED', caseId: 'case-A', ownRef: 'REF-A' },
        { rowNumber: 3, status: 'CREATED', caseId: 'case-B', ownRef: 'REF-B' },
      ]);
      expect(prisma.$transaction).toHaveBeenCalledTimes(2);
      expect(cases.createForImport.mock.calls[0][2]).toMatchObject({
        openedAt: new Date('2026-02-15T00:00:00Z'), limitationDeadline: new Date('2027-12-01T00:00:00Z'), opponents: ['X'], closed: null,
      });
      expect(cases.createForImport.mock.calls[1][2].closed).toEqual({
        outcome: 'WON', closingSummary: 'ชนะคดีเรียบร้อยแล้ว', closedAt: new Date('2025-09-30T00:00:00Z'),
      });
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ firmId: 'f1', userId: 'u1', action: 'CASES_IMPORTED_EXCEL', metadata: { created: 2, failed: 0 } }),
      });
    });

    it('rejects the request when a lead or team member is not in the firm', async () => {
      prisma.firmMember.count.mockResolvedValue(1);
      await expect(service.createCases(user, { rows: [row('A', { buddyIds: ['u-ghost'] })] } as any)).rejects.toBeInstanceOf(BadRequestException);
      expect(cases.createForImport).not.toHaveBeenCalled();
    });

    it('rejects a lead who is a member but not a lawyer', async () => {
      await expect(service.createCases(user, { rows: [row('A', { leadLawyerId: 'u-assistant' })] } as any)).rejects.toThrow('ทนายหลักต้องเป็นทนายของสำนักงาน');
      expect(cases.createForImport).not.toHaveBeenCalled();
    });

    it('rejects a caseTypeId or clientId from another firm', async () => {
      await expect(service.createCases(user, { rows: [row('A', { caseTypeId: 't-other' })] } as any)).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.createCases(user, { rows: [row('A', { clientId: 'c-other' })] } as any)).rejects.toBeInstanceOf(BadRequestException);
      expect(cases.createForImport).not.toHaveBeenCalled();
    });

    it('checks the plan once for open rows', async () => {
      await service.createCases(user, { rows: [row('A'), row('B', { closed: true, outcome: 'WON', closingSummary: 'ชนะคดีเรียบร้อยแล้ว' })] } as any);
      expect(planCheck).toHaveBeenCalledTimes(1);
      expect(planCheck).toHaveBeenCalledWith(prisma, 'f1', 1);
    });

    it('re-checks duplicates at create time and keeps going', async () => {
      const { results } = await service.createCases(user, { rows: [
        row('A', { blackCaseNumber: 'พ1/2569', courtName: 'ศาลแพ่ง' }),
        row('B', { rowNumber: 3 }),
      ] } as any);
      expect(results[0]).toEqual({ rowNumber: 2, status: 'FAILED', message: 'มีคดีนี้ในระบบแล้ว (TSB-1)' });
      expect(results[1].status).toBe('CREATED');
    });

    it('re-checks the date rules the browser could have bypassed', async () => {
      const { results } = await service.createCases(user, { rows: [
        row('A', { openedAt: '2999-01-01' }),
        row('B', { rowNumber: 3, closed: true, outcome: 'WON', closingSummary: 'ชนะคดีเรียบร้อยแล้ว', openedAt: '2026-05-01', closedAt: '2026-04-01' }),
        row('C', { rowNumber: 4, closed: true, outcome: 'WON', closingSummary: 'ชนะคดีเรียบร้อยแล้ว', closedAt: '2999-01-01' }),
      ] } as any);
      expect(results.map((r) => r.message)).toEqual(['วันเปิดคดีอยู่ในอนาคต', 'วันปิดคดีก่อนวันเปิดคดี', 'วันปิดคดีอยู่ในอนาคต']);
      expect(cases.createForImport).not.toHaveBeenCalled();
    });

    it('a failing row does not stop the others', async () => {
      prisma.$transaction.mockRejectedValueOnce(new Error('boom'));
      const { results } = await service.createCases(user, { rows: [row('A'), row('B', { rowNumber: 3 })] } as any);
      expect(results.map((r) => r.status)).toEqual(['FAILED', 'CREATED']);
      expect(results[0].message).toBe('สร้างคดีไม่สำเร็จ');
    });
  });
});
