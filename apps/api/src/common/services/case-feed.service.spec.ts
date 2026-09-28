import { Test } from '@nestjs/testing';
import { ActivityType, CaseStatus } from '@lawfirm/shared';
import { PrismaService } from '../../prisma/prisma.module';
import { CaseFeedService } from './case-feed.service';

/**
 * การเปลี่ยนสถานะมีผู้อ่านสองแบบ (คน + รายงาน operations) แต่ต้องมีคนเขียนคนเดียว
 * ไม่งั้น timeline กับ case-health จะเล่าเรื่องคนละเรื่องเมื่อมี path ใดลืมเขียน
 */
describe('CaseFeedService', () => {
  let service: CaseFeedService;
  let prisma: {
    caseActivity: { create: jest.Mock };
    caseStatusLog: { create: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      caseActivity: { create: jest.fn().mockResolvedValue({}) },
      caseStatusLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const module = await Test.createTestingModule({
      providers: [CaseFeedService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(CaseFeedService);
  });

  it('ลง activity feed เสมอ', async () => {
    await service.log({
      caseId: 'case-1',
      userId: 'u1',
      type: ActivityType.DOCUMENT,
      title: 'อัปโหลดเอกสาร',
    });

    expect(prisma.caseActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ caseId: 'case-1', type: 'DOCUMENT', createdById: 'u1' }),
      }),
    );
    expect(prisma.caseStatusLog.create).not.toHaveBeenCalled();
  });

  it('ระบุ statusTransition แล้วลง CaseStatusLog ให้ด้วยจาก call เดียว', async () => {
    await service.log({
      caseId: 'case-1',
      userId: 'u1',
      type: ActivityType.STATUS_CHANGE,
      title: 'ปิดคดี',
      statusTransition: { from: CaseStatus.IN_PROGRESS, to: CaseStatus.CLOSED },
    });

    expect(prisma.caseActivity.create).toHaveBeenCalledTimes(1);
    expect(prisma.caseStatusLog.create).toHaveBeenCalledWith({
      data: {
        caseId: 'case-1',
        fromStatus: CaseStatus.IN_PROGRESS,
        toStatus: CaseStatus.CLOSED,
        changedById: 'u1',
      },
    });
  });

  it('ลง feed ไม่สำเร็จไม่ทำให้การกระทำหลักล้มเหลว', async () => {
    prisma.caseActivity.create.mockRejectedValue(new Error('DB down'));

    await expect(
      service.log({ caseId: 'case-1', userId: 'u1', type: ActivityType.NOTE, title: 'x' }),
    ).resolves.toBeUndefined();
  });

  describe('error handling', () => {
    const params = { caseId: 'case-1', userId: 'u1', type: ActivityType.NOTE, title: 't' };

    it('swallows a failed insert on the default client', async () => {
      prisma.caseActivity.create.mockRejectedValueOnce(new Error('fk'));
      await expect(service.log(params)).resolves.toBeUndefined();
    });

    it('rethrows a failed insert inside a transaction so it cannot turn COMMIT into a silent ROLLBACK', async () => {
      const tx = { caseActivity: { create: jest.fn().mockRejectedValue(new Error('fk')) } };
      await expect(service.log(params, tx as any)).rejects.toThrow('fk');
      expect(prisma.caseActivity.create).not.toHaveBeenCalled();
    });
  });
});
