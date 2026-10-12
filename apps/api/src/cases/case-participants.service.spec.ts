import { Test } from '@nestjs/testing';
import { CaseParticipantsService } from './case-participants.service';
import { PrismaService } from '../prisma/prisma.module';
import { CaseFeedService } from '../common/services/case-feed.service';

describe('CaseParticipantsService', () => {
  const user = { id: 'u1', firmId: 'firm-1' } as any;
  let service: CaseParticipantsService;
  let prisma: any;
  const feed = { log: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma = {
      case: { findFirst: jest.fn().mockResolvedValue({ id: 'case-1' }) },
      caseParticipant: {
        findFirst: jest.fn(),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'p9', ...data })),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'p1', name: 'เดิม', role: 'DEFENDANT', ...data })),
        delete: jest.fn(),
      },
      client: { count: jest.fn().mockResolvedValue(1) },
      clientContact: { count: jest.fn() },
      caseType: { count: jest.fn() },
      firmMember: { count: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    const module = await Test.createTestingModule({
      providers: [
        CaseParticipantsService,
        { provide: PrismaService, useValue: prisma },
        { provide: CaseFeedService, useValue: feed },
      ],
    }).compile();
    service = module.get(CaseParticipantsService);
  });

  it('adding a party writes a case activity and an audit row', async () => {
    await service.create(user, 'case-1', { name: 'บริษัท ข', role: 'DEFENDANT', side: 'OPPONENT' } as any);

    expect(feed.log).toHaveBeenCalledWith(
      expect.objectContaining({ caseId: 'case-1', userId: 'u1', type: 'NOTE', title: 'เพิ่มคู่ความ: บริษัท ข (จำเลย)' }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        firmId: 'firm-1', userId: 'u1', action: 'CASE_PARTICIPANT_ADDED',
        metadata: { caseId: 'case-1', participantId: 'p9', name: 'บริษัท ข', role: 'DEFENDANT', side: 'OPPONENT' },
      },
    });
  });

  it('rejects a client from another firm', async () => {
    prisma.client.count.mockResolvedValue(0);
    await expect(
      service.create(user, 'case-1', { name: 'x', role: 'PLAINTIFF', side: 'OURS', clientId: 'foreign' } as any),
    ).rejects.toThrow('ลูกความที่เลือกไม่อยู่ในสำนักงานนี้');
  });

  it('rejects counsel linked to a party of another case, or to itself', async () => {
    prisma.caseParticipant.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.create(user, 'case-1', { name: 'ทนาย', role: 'OPPOSING_LAWYER', side: 'OPPONENT', representedByParticipantId: 'other' } as any),
    ).rejects.toThrow('คู่ความที่เลือกไม่อยู่ในคดีนี้');

    prisma.caseParticipant.findFirst.mockResolvedValueOnce({ id: 'p1', caseId: 'case-1' });
    await expect(
      service.update(user, 'case-1', 'p1', { representedByParticipantId: 'p1' } as any),
    ).rejects.toThrow('คู่ความที่เลือกไม่อยู่ในคดีนี้');
  });

  it('removing a party is logged and audited', async () => {
    prisma.caseParticipant.findFirst.mockResolvedValue({ id: 'p1', caseId: 'case-1', name: 'เดิม', role: 'DEFENDANT', side: 'OPPONENT' });

    await service.remove(user, 'case-1', 'p1');

    expect(feed.log).toHaveBeenCalledWith(expect.objectContaining({ title: 'ลบคู่ความ: เดิม (จำเลย)' }));
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'CASE_PARTICIPANT_REMOVED' }),
    });
  });

  describe('the row that represents the case client', () => {
    const REFUSED = 'ลบหรือย้ายฝ่ายลูกความหลักของคดีไม่ได้ — เปลี่ยนลูกความที่หน้าข้อมูลคดีแทน';
    const ourRow = { id: 'p1', caseId: 'case-1', name: 'ลูกความ', role: 'PLAINTIFF', side: 'OURS', clientId: 'client-1' };

    beforeEach(() => {
      prisma.case.findFirst.mockResolvedValue({ id: 'case-1', clientId: 'client-1' });
      prisma.caseParticipant.findFirst.mockResolvedValue(ourRow);
    });

    it('cannot be deleted', async () => {
      await expect(service.remove(user, 'case-1', 'p1')).rejects.toThrow(REFUSED);
      expect(prisma.caseParticipant.delete).not.toHaveBeenCalled();
    });

    it('cannot leave our side or be re-linked to another client or none', async () => {
      for (const dto of [{ side: 'OPPONENT' }, { side: 'NEUTRAL' }, { clientId: null }, { clientId: 'client-2' }]) {
        await expect(service.update(user, 'case-1', 'p1', dto as any)).rejects.toThrow(REFUSED);
      }
      expect(prisma.caseParticipant.update).not.toHaveBeenCalled();
    });

    it('can still be renamed, re-roled or saved with the same side and client', async () => {
      await service.update(user, 'case-1', 'p1', { name: 'ชื่อใหม่', role: 'JOINT_PLAINTIFF', side: 'OURS', clientId: 'client-1' } as any);
      expect(prisma.caseParticipant.update).toHaveBeenCalled();
    });

    it('can be renamed when an older row already sits outside our side, as long as the side is not changed again', async () => {
      prisma.caseParticipant.findFirst.mockResolvedValue({ ...ourRow, side: 'NEUTRAL' });
      await service.update(user, 'case-1', 'p1', { name: 'ชื่อใหม่', side: 'NEUTRAL' } as any);
      expect(prisma.caseParticipant.update).toHaveBeenCalled();
      await expect(service.update(user, 'case-1', 'p1', { side: 'OPPONENT' } as any)).rejects.toThrow(REFUSED);
    });

    it('does not protect an unrelated party, and protects nothing on a case without a client', async () => {
      prisma.caseParticipant.findFirst.mockResolvedValue({ ...ourRow, id: 'p2', side: 'OPPONENT', clientId: null });
      await expect(service.remove(user, 'case-1', 'p2')).resolves.toEqual({ deleted: true });

      prisma.case.findFirst.mockResolvedValue({ id: 'case-1', clientId: null });
      prisma.caseParticipant.findFirst.mockResolvedValue({ ...ourRow, clientId: null });
      await expect(service.remove(user, 'case-1', 'p1')).resolves.toEqual({ deleted: true });
    });
  });
});
