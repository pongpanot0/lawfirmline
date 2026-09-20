import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { AuthUser, ConflictResult, FirmRole, Role } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { ConflictCheckService, suggestResult } from './conflict-check.service';

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
    intake: { ...empty, findFirst: jest.fn().mockResolvedValue({ id: 'intake-1' }) },
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
