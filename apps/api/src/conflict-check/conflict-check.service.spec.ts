import { Test } from '@nestjs/testing';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { AuthUser, ConflictResult, FirmRole, Role } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { ConflictCheckService, opponentConflicts, suggestResult } from './conflict-check.service';

const user = {
  id: 'u1',
  firmId: 'firm-1',
  role: Role.LAWYER,
  firmRole: FirmRole.LAWYER,
  email: 'a@b.c',
} as unknown as AuthUser;

function prismaMock(overrides: Record<string, unknown> = {}) {
  const empty = { findMany: jest.fn().mockResolvedValue([]) };
  return {
    client: { ...empty },
    clientContact: { ...empty },
    caseParticipant: { ...empty },
    case: { ...empty },
    caseClient: { ...empty },
    auditLog: { create: jest.fn() },
    intake: { ...empty, findFirst: jest.fn().mockResolvedValue({ id: 'intake-1', stage: 'NEW_INQUIRY' }), update: jest.fn() },
    conflictCheck: { create: jest.fn((args) => ({ id: 'cc1', ...args.data })), findFirst: jest.fn(), findMany: jest.fn() },
    ...overrides,
  };
}

async function build(prisma: Record<string, unknown>) {
  const module = await Test.createTestingModule({
    providers: [ConflictCheckService, { provide: PrismaService, useValue: prisma }],
  }).compile();
  return module.get(ConflictCheckService);
}

describe('ConflictCheckService', () => {
  it('ค้นเจอคู่กรณีในคดีอื่นของสำนักงาน และบอกว่าเจอเพราะคำค้นไหน', async () => {
    const prisma = prismaMock({
      caseParticipant: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'p1',
            name: 'สมชาย ใจดี',
            role: 'DEFENDANT',
            side: 'OPPONENT',
            case: { id: 'case-9', title: 'คดีเก่า', ownRef: 'REF9', status: 'OPEN' },
          },
        ]),
      },
    });
    const service = await build(prisma);

    const result = await service.search(user, ['สมชาย']);

    expect(result.matchCount).toBe(1);
    expect(result.matches[0]).toMatchObject({
      kind: 'CASE_PARTY',
      term: 'สมชาย',
      side: 'OPPONENT',
      caseId: 'case-9',
      ownRef: 'REF9',
    });
    expect(result.suggestedResult).toBe(ConflictResult.POTENTIAL_CONFLICT);
  });

  it('ไม่เจออะไร = CLEAR', async () => {
    const service = await build(prismaMock());
    await expect(service.search(user, ['ไม่มีใครชื่อนี้'])).resolves.toMatchObject({
      matchCount: 0,
      suggestedResult: ConflictResult.CLEAR,
    });
  });

  it('คำค้นว่างทั้งหมดถูกปฏิเสธ — ค้นด้วยคำว่างเท่ากับไม่ได้ตรวจ', async () => {
    const service = await build(prismaMock());
    await expect(service.search(user, ['  ', ''])).rejects.toBeInstanceOf(BadRequestException);
  });

  it('บันทึกผลพร้อม snapshot ของสิ่งที่เจอ และคำตัดสินของทนาย ไม่ใช่ของระบบ', async () => {
    const prisma = prismaMock({
      client: { findMany: jest.fn().mockResolvedValue([{ id: 'c1', name: 'บริษัท ก' }]) },
    });
    const service = await build(prisma);

    await service.record(user, {
      terms: ['บริษัท ก'],
      intakeId: 'intake-1',
      result: ConflictResult.CLEAR,
      notes: 'เป็นลูกความเดิม ไม่ขัดกัน',
    });

    const data = (prisma.conflictCheck as { create: jest.Mock }).create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      firmId: 'firm-1',
      intakeId: 'intake-1',
      matchCount: 1,
      result: ConflictResult.CLEAR,
      checkedById: 'u1',
    });
    expect(data.matches).toHaveLength(1);
  });

  it('ไม่รับ intake ของสำนักงานอื่น', async () => {
    const prisma = prismaMock({
      intake: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
    });
    const service = await build(prisma);
    await expect(
      service.record(user, { terms: ['abc'], intakeId: 'other', result: ConflictResult.CLEAR }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('suggestResult', () => {
  it('ชื่อเดียวอยู่ทั้งฝ่ายเราและฝ่ายตรงข้าม = CONFLICT', () => {
    expect(
      suggestResult([
        { kind: 'CLIENT', term: 'ก', name: 'ก', side: 'OURS' },
        { kind: 'CASE_PARTY', term: 'ก', name: 'ก', side: 'OPPONENT' },
      ]),
    ).toBe(ConflictResult.CONFLICT);
  });

  it('เจอแต่ไม่รู้ฝ่าย = ต้องให้คนดู ไม่ใช่ปล่อยผ่าน', () => {
    expect(suggestResult([{ kind: 'CASE_PARTY', term: 'ก', name: 'ก' }])).toBe(
      ConflictResult.NEEDS_REVIEW,
    );
  });
});

describe('conflict gate', () => {
  const ourClientAsOpponentElsewhere = {
    caseParticipant: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'p1', name: 'บริษัท ก จำกัด', role: 'DEFENDANT', side: 'OPPONENT',
          case: { id: 'case-9', title: 'คดีเก่า', ownRef: 'REF9', status: 'OPEN' } },
      ]),
    },
  };

  it('a name on the same side elsewhere is not a conflict; the other side is', () => {
    const matches = [
      { kind: 'CLIENT', term: 'บริษัท ก จำกัด', name: 'บริษัท ก จำกัด', side: 'OURS' },
      { kind: 'CASE_PARTY', term: 'บริษัท ก จำกัด', name: 'บริษัท ก จำกัด', side: 'OPPONENT' },
      { kind: 'CASE_PARTY', term: 'นาย ข', name: 'นาย ข', side: 'NEUTRAL' },
    ] as any;
    expect(
      opponentConflicts([{ name: 'บริษัท ก จำกัด', side: 'OURS' }, { name: 'นาย ข', side: 'OPPONENT' }], matches),
    ).toEqual([matches[1]]);
  });

  it('opens CLEAR when nothing clashes', async () => {
    const service = await build(prismaMock());
    const gate = await service.gateNewCase(user, { parties: [{ name: 'บริษัท ใหม่ จำกัด', side: 'OURS' }] });
    expect(gate).toMatchObject({ result: ConflictResult.CLEAR, overrideReason: null });
  });

  it('short names and the "tmp" placeholder are not searched and do not throw', async () => {
    const prisma = prismaMock();
    const service = await build(prisma);
    const gate = await service.gateNewCase(user, {
      parties: [{ name: 'tmp', side: 'OURS' }, { name: 'ab', side: 'OPPONENT' }, { name: ' ', side: 'OPPONENT' }],
    });
    expect(gate).toEqual({ result: ConflictResult.CLEAR, terms: [], matches: [], overrideReason: null });
    expect((prisma.client as any).findMany).not.toHaveBeenCalled();
  });

  it('a clash without a reason is a 409 CONFLICT_FOUND carrying the matches', async () => {
    const service = await build(prismaMock(ourClientAsOpponentElsewhere));
    const attempt = service.gateNewCase(user, { parties: [{ name: 'บริษัท ก จำกัด', side: 'OURS' }] });
    await expect(attempt).rejects.toBeInstanceOf(ConflictException);
    await expect(attempt).rejects.toMatchObject({
      response: { code: 'CONFLICT_FOUND', matches: [expect.objectContaining({ caseId: 'case-9', side: 'OPPONENT' })] },
    });
  });

  it('a reason under 10 characters is refused; a proper one lets it through as POTENTIAL_CONFLICT', async () => {
    const service = await build(prismaMock(ourClientAsOpponentElsewhere));
    await expect(
      service.gateNewCase(user, { parties: [{ name: 'บริษัท ก จำกัด', side: 'OURS' }], overrideReason: 'สั้นไป' }),
    ).rejects.toThrow('เหตุผลที่ข้ามผลตรวจต้องยาวอย่างน้อย 10 ตัวอักษร');

    const gate = await service.gateNewCase(user, {
      parties: [{ name: 'บริษัท ก จำกัด', side: 'OURS' }],
      overrideReason: 'คดีเก่าจบไปแล้วและลูกความยินยอมเป็นหนังสือ',
    });
    expect(gate.result).toBe(ConflictResult.POTENTIAL_CONFLICT);
  });

  it('ignores hits on the intake being converted', async () => {
    const service = await build(prismaMock({
      intake: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'intake-1', title: 'เรื่องนี้', clientName: 'x', opposingParty: 'บริษัท ก จำกัด', contactName: null, status: 'OPEN' },
        ]),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    }));
    const gate = await service.gateNewCase(user, {
      parties: [{ name: 'บริษัท ก จำกัด', side: 'OURS' }],
      excludeIntakeId: 'intake-1',
    });
    expect(gate.result).toBe(ConflictResult.CLEAR);
  });

  it('records the check on the case, audits an override and moves an earlier intake to CONFLICT_CHECK', async () => {
    const prisma = prismaMock();
    const service = await build(prisma);

    await service.recordForCase(
      user,
      { result: ConflictResult.POTENTIAL_CONFLICT, terms: ['บริษัท ก จำกัด'], matches: [{ kind: 'CLIENT' } as any], overrideReason: 'ลูกความยินยอมเป็นหนังสือแล้ว' },
      { caseId: 'case-1', intakeId: 'intake-1' },
    );

    expect((prisma.conflictCheck as any).create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        caseId: 'case-1', intakeId: 'intake-1', result: 'POTENTIAL_CONFLICT',
        notes: 'ลูกความยินยอมเป็นหนังสือแล้ว', matchCount: 1, checkedById: 'u1', firmId: 'firm-1',
      }),
    });
    expect((prisma.auditLog as any).create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'CONFLICT_OVERRIDDEN' }),
    });
    expect((prisma.intake as any).update).toHaveBeenCalledWith({
      where: { id: 'intake-1' },
      data: { stage: 'CONFLICT_CHECK', stageChangedAt: expect.any(Date) },
    });
  });

  it('finds our additional clients as OURS', async () => {
    const service = await build(prismaMock({
      caseClient: {
        findMany: jest.fn().mockResolvedValue([
          { client: { id: 'cl-2', name: 'บริษัท ร่วม จำกัด' }, case: { id: 'case-3', title: 'คดี', ownRef: 'R3', status: 'OPEN' } },
        ]),
      },
    }));
    const found = await service.search(user, ['บริษัท ร่วม']);
    expect(found.matches).toContainEqual(expect.objectContaining({ kind: 'CASE_CLIENT', side: 'OURS', caseId: 'case-3' }));
  });
});
