import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { CasesService } from './cases.service';
import { PrismaService } from '../prisma/prisma.module';
import { CaseAccessService } from '../common/services/case-access.service';
import { CaseFeedService } from '../common/services/case-feed.service';
import { CaseActivitiesService } from './case-activities.service';
import { AssignmentNotifierService } from '../notifications/assignment-notifier.service';

/** ปิดคดีทับของค้างเงียบ ๆ คือการซ่อนของค้าง ไม่ใช่การทำให้เสร็จ */
describe('CasesService.close — ด่านของค้าง', () => {
  const user = { id: 'u1', firmId: 'firm-1', firmRole: 'OWNER' } as any;
  let service: CasesService;
  let prisma: any;
  const feed = { log: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma = {
      case: {
        findFirst: jest.fn().mockResolvedValue({ id: 'case-1' }),
        findUnique: jest.fn().mockResolvedValue({ id: 'case-1', status: 'OPEN', stage: 'HEARING', title: 'คดี' }),
        update: jest.fn().mockResolvedValue({ id: 'case-1', status: 'CLOSED' }),
      },
      task: { findMany: jest.fn().mockResolvedValue([]) },
      calendarEvent: { findMany: jest.fn().mockResolvedValue([]) },
      document: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const module = await Test.createTestingModule({
      providers: [
        CasesService,
        { provide: PrismaService, useValue: prisma },
        { provide: CaseFeedService, useValue: feed },
        {
          provide: CaseAccessService,
          useValue: {
            canAccessCase: jest.fn().mockResolvedValue(true),
            getCaseFilterForUser: jest.fn().mockReturnValue({}),
            getTaskFilterForUser: jest.fn().mockReturnValue({}),
          },
        },
        { provide: CaseActivitiesService, useValue: { create: jest.fn() } },
        { provide: AssignmentNotifierService, useValue: { notifyAssigned: jest.fn() } },
      ],
    }).compile();
    service = module.get(CasesService);
  });

  const summary = 'สรุปคดีอย่างน้อยสิบตัวอักษร';

  it('ปิดได้เมื่อไม่มีของค้าง และบันทึกผลคดี + ย้ายขั้นตอนไปปิดคดี', async () => {
    await service.close(user, 'case-1', { closingSummary: summary, outcome: 'WON' } as any);

    const data = prisma.case.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ status: 'CLOSED', stage: 'CLOSING', outcome: 'WON' });
    expect(feed.log).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'STATUS_CHANGE', caseId: 'case-1' }),
    );
  });

  it('ปิดไม่ได้เมื่อยังมีงานค้าง ถ้าไม่ได้กดรับทราบ', async () => {
    prisma.task.findMany.mockResolvedValue([{ id: 't1', title: 'ยื่นคำแถลง', status: 'TODO' }]);

    await expect(
      service.close(user, 'case-1', { closingSummary: summary } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.case.update).not.toHaveBeenCalled();
  });

  it('วันนัดในอนาคตและเอกสารที่ยังไม่อนุมัติก็นับเป็นของค้าง', async () => {
    prisma.calendarEvent.findMany.mockResolvedValue([{ id: 'e1', title: 'นัดสืบพยาน' }]);
    prisma.document.findMany.mockResolvedValue([{ id: 'd1', filename: 'ร่างคำฟ้อง.pdf' }]);

    const outstanding = await service.outstanding(user, 'case-1');
    expect(outstanding.total).toBe(2);
  });

  it('กดรับทราบแล้วปิดได้ และของค้างถูกบันทึกไว้ใน feed', async () => {
    prisma.task.findMany.mockResolvedValue([{ id: 't1', title: 'ยื่นคำแถลง', status: 'TODO' }]);

    await service.close(user, 'case-1', {
      closingSummary: summary,
      acknowledgeOutstanding: true,
    } as any);

    expect(prisma.case.update).toHaveBeenCalled();
    expect(feed.log.mock.calls[0][0].description).toContain('ของค้าง 1 รายการ');
  });

  it('คดีที่ปิดแล้วปิดซ้ำไม่ได้', async () => {
    prisma.case.findUnique.mockResolvedValue({ id: 'case-1', status: 'CLOSED', stage: 'CLOSING' });
    await expect(
      service.close(user, 'case-1', { closingSummary: summary } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
