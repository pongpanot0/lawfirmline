import * as ExcelJS from 'exceljs';
import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { AuthUser } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { CasesService } from '../cases/cases.service';
import { CASE_IMPORT_HEADERS, CASE_IMPORT_SHEET } from './case-import-columns';
import { CaseImportService } from './case-import.service';

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
    const module = await Test.createTestingModule({
      providers: [
        CaseImportService,
        { provide: PrismaService, useValue: prisma },
        { provide: CasesService, useValue: { createForImport: jest.fn() } },
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
});
