import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ClosingEmailService } from './closing-email.service';
import { PrismaService } from '../prisma/prisma.module';

describe('ClosingEmailService.gatherCaseData', () => {
  let service: ClosingEmailService;
  const mockPrisma = {
    case: { findUnique: jest.fn() },
    caseActivity: { findMany: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClosingEmailService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get(ClosingEmailService);
  });

  it('throws NotFoundException when case does not exist', async () => {
    mockPrisma.case.findUnique.mockResolvedValue(null);
    await expect(service.gatherCaseData('missing-id')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('returns case data with activities and no missing-data notes when closingSummary and courtName are present', async () => {
    mockPrisma.case.findUnique.mockResolvedValue({
      id: 'case-1',
      ownRef: 'CASE-001',
      customerRef: 'CUST-1',
      clientName: 'บริษัท ทดสอบ จำกัด',
      title: 'คดีทดสอบ',
      courtName: 'ศาลแพ่ง',
      closingSummary: 'สรุปคดี',
      closedAt: new Date('2026-08-01'),
    });
    mockPrisma.caseActivity.findMany.mockResolvedValue([
      {
        id: 'act-1',
        title: 'ยื่นฟ้อง',
        description: 'ยื่นคำฟ้องต่อศาล',
        activityAt: new Date('2026-01-15'),
      },
    ]);

    const result = await service.gatherCaseData('case-1');

    expect(result.ownRef).toBe('CASE-001');
    expect(result.activities).toHaveLength(1);
    expect(result.activities[0].title).toBe('ยื่นฟ้อง');
    expect(result.missingDataNotes).toEqual([]);
  });

  it('flags missing data when closingSummary is null', async () => {
    mockPrisma.case.findUnique.mockResolvedValue({
      id: 'case-1',
      ownRef: 'CASE-001',
      customerRef: null,
      clientName: null,
      title: 'คดีทดสอบ',
      courtName: null,
      closingSummary: null,
      closedAt: null,
    });
    mockPrisma.caseActivity.findMany.mockResolvedValue([]);

    const result = await service.gatherCaseData('case-1');

    expect(result.missingDataNotes).toContain(
      'ยังไม่มีสรุปผลคดี (closingSummary) — กรอกก่อนส่งอีเมลจริง',
    );
  });
});
