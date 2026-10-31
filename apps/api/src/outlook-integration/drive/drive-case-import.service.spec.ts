import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AuthUser, CaseOutcome, CourtLevel } from '@lawfirm/shared';
import { PrismaService } from '../../prisma/prisma.module';
import { CasesService } from '../../cases/cases.service';
import { GraphDriveClient } from '../graph/graph-drive.client';
import { CaseDriveService } from './case-drive.service';
import { DriveCaseImportService } from './drive-case-import.service';
import { ImportDriveCasesDto } from './drive-case-import.dto';
import * as planLimits from '../../common/plan-limits';

describe('DriveCaseImportService', () => {
  let service: DriveCaseImportService;
  const user = { id: 'u1', firmId: 'f1', firmRole: 'LAWYER' } as unknown as AuthUser;
  const prisma: any = {
    firmMember: { count: jest.fn() },
    caseExternalLink: { findFirst: jest.fn(), create: jest.fn() },
    $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(tx)),
  };
  const tx = { caseExternalLink: prisma.caseExternalLink };
  const cases = { createForImport: jest.fn() };
  const drive = { getItem: jest.fn() };
  const caseDrive = { ownToken: jest.fn(), audit: jest.fn() };
  let planCheck: jest.SpyInstance;

  const row = (itemId: string, extra: Record<string, unknown> = {}) => ({
    itemId,
    title: `คดี ${itemId}`,
    courtLevel: CourtLevel.TRIAL,
    leadLawyerId: '00000000-0000-4000-8000-000000000001',
    closed: false,
    ...extra,
  });
  const folder = (id: string) => ({ id, name: `${id}. คดี`, folder: {}, parentReference: { driveId: 'b!d', path: '/drive/root:/11111' } });

  beforeEach(async () => {
    jest.clearAllMocks();
    planCheck = jest.spyOn(planLimits, 'assertCanOpenCases').mockResolvedValue(undefined);
    prisma.firmMember.count.mockResolvedValue(1);
    prisma.caseExternalLink.findFirst.mockResolvedValue(null);
    prisma.caseExternalLink.create.mockImplementation(({ data }: any) => ({ id: `link-${data.externalId}`, ...data }));
    caseDrive.ownToken.mockResolvedValue({ connectionId: 'conn-me', token: 'tok' });
    drive.getItem.mockImplementation((_t: string, _d: string, id: string) => folder(id));
    cases.createForImport.mockImplementation((_tx: unknown, _u: unknown, p: any) => ({ id: `case-${p.title}`, ownRef: 'TSB-1' }));
    const module = await Test.createTestingModule({
      providers: [
        DriveCaseImportService,
        { provide: PrismaService, useValue: prisma },
        { provide: CasesService, useValue: cases },
        { provide: GraphDriveClient, useValue: drive },
        { provide: CaseDriveService, useValue: caseDrive },
      ],
    }).compile();
    service = module.get(DriveCaseImportService);
  });

  it('creates a case and a DRIVE_FOLDER link per row in one transaction', async () => {
    const { results } = await service.importCases(user, { driveId: 'b!d', rows: [row('F1')] } as any);

    expect(results).toEqual([{ itemId: 'F1', status: 'CREATED', caseId: 'case-คดี F1', ownRef: 'TSB-1' }]);
    expect(cases.createForImport).toHaveBeenCalledWith(tx, user, expect.objectContaining({ title: 'คดี F1', buddyIds: [], closed: null }));
    expect(prisma.caseExternalLink.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        firmId: 'f1', caseId: 'case-คดี F1', connectionId: 'conn-me', kind: 'DRIVE_FOLDER',
        externalId: 'F1', driveId: 'b!d', displayPath: '11111/F1. คดี', linkedById: 'u1',
      }),
    });
    expect(caseDrive.audit).toHaveBeenCalledWith(user, 'DRIVE_FOLDER_LINKED', expect.objectContaining({ caseId: 'case-คดี F1', source: 'IMPORT' }));
  });

  it('skips a folder another user already linked', async () => {
    prisma.caseExternalLink.findFirst.mockResolvedValue({ caseId: 'c-old', connectionId: 'conn-other' });

    const { results } = await service.importCases(user, { driveId: 'b!d', rows: [row('F1')] } as any);

    expect(prisma.caseExternalLink.findFirst).toHaveBeenCalledWith({
      where: { firmId: 'f1', kind: 'DRIVE_FOLDER', driveId: 'b!d', externalId: 'F1' },
      select: { caseId: true },
    });
    expect(results).toEqual([{ itemId: 'F1', status: 'ALREADY_LINKED', caseId: 'c-old' }]);
    expect(cases.createForImport).not.toHaveBeenCalled();
  });

  it('reports a unique violation inside the transaction as ALREADY_LINKED', async () => {
    prisma.$transaction.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 'P2002' }));

    const { results } = await service.importCases(user, { driveId: 'b!d', rows: [row('F1')] } as any);

    expect(results[0]).toMatchObject({ itemId: 'F1', status: 'ALREADY_LINKED' });
  });

  it('fails only the row whose item is a file', async () => {
    drive.getItem.mockImplementation((_t: string, _d: string, id: string) => (id === 'F2' ? { ...folder(id), folder: undefined } : folder(id)));

    const { results } = await service.importCases(user, { driveId: 'b!d', rows: [row('F1'), row('F2'), row('F3')] } as any);

    expect(results.map((r) => r.status)).toEqual(['CREATED', 'FAILED', 'CREATED']);
    expect(results[1].message).toBe('เลือกได้เฉพาะ folder');
  });

  it('rejects the whole request when a lead or buddy is not a firm member', async () => {
    prisma.firmMember.count.mockResolvedValue(1);
    const rows = [row('F1', { buddyIds: ['00000000-0000-4000-8000-000000000009'] })];

    await expect(service.importCases(user, { driveId: 'b!d', rows } as any)).rejects.toBeInstanceOf(BadRequestException);
    expect(cases.createForImport).not.toHaveBeenCalled();
  });

  it('checks the plan once for the open rows only', async () => {
    const closed = { closed: true, outcome: CaseOutcome.WON, closingSummary: 'ชนะคดีแล้วเรียบร้อย' };
    await service.importCases(user, { driveId: 'b!d', rows: [row('F1'), row('F2'), row('F3', closed)] } as any);
    expect(planCheck).toHaveBeenCalledTimes(1);
    expect(planCheck).toHaveBeenCalledWith(prisma, 'f1', 2);

    planCheck.mockRejectedValueOnce(new Error('limit'));
    cases.createForImport.mockClear();
    await expect(service.importCases(user, { driveId: 'b!d', rows: [row('F1')] } as any)).rejects.toThrow('limit');
    expect(cases.createForImport).not.toHaveBeenCalled();
  });

  it('passes the closed fields through with a trimmed summary', async () => {
    await service.importCases(user, {
      driveId: 'b!d',
      rows: [row('F1', { closed: true, outcome: CaseOutcome.WITHDRAWN, closingSummary: '  นำเข้าจาก OneDrive: F1  ' })],
    } as any);
    expect(cases.createForImport.mock.calls[0][2].closed).toEqual({ outcome: 'WITHDRAWN', closingSummary: 'นำเข้าจาก OneDrive: F1' });
  });
});

describe('ImportDriveCasesDto', () => {
  const lead = '00000000-0000-4000-8000-000000000001';
  const errorsFor = async (rows: unknown[]) =>
    validate(plainToInstance(ImportDriveCasesDto, { driveId: 'b!d', rows }));
  const ok = { itemId: 'F1', title: 'คดี', courtLevel: 'TRIAL', leadLawyerId: lead, closed: false };

  it('accepts an open row and a complete closed row', async () => {
    expect(await errorsFor([ok, { ...ok, itemId: 'F2', closed: true, outcome: 'WON', closingSummary: 'สรุปยาวพอแล้วครับ' }])).toHaveLength(0);
  });

  it.each([
    ['closed without outcome', { closed: true, closingSummary: 'สรุปยาวพอแล้วครับ' }],
    ['closed as IN_PROGRESS', { closed: true, outcome: 'IN_PROGRESS', closingSummary: 'สรุปยาวพอแล้วครับ' }],
    ['closed with a short summary', { closed: true, outcome: 'WON', closingSummary: 'สั้นไป' }],
    ['a bad case number', { blackCaseNumber: '264.69' }],
  ])('rejects %s', async (_label, extra) => {
    expect((await errorsFor([{ ...ok, ...extra }])).length).toBeGreaterThan(0);
  });

  it('rejects duplicate folders in one request', async () => {
    expect((await errorsFor([ok, ok])).length).toBeGreaterThan(0);
  });
});
