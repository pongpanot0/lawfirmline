import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DocumentReviewService } from './document-review.service';
import { PrismaService } from '../prisma/prisma.module';
import { AssignmentNotifierService } from '../notifications/assignment-notifier.service';

describe('DocumentReviewService', () => {
  let service: DocumentReviewService;
  const mockPrisma = {
    documentVersion: { findFirst: jest.fn(), update: jest.fn() },
    case: { findFirst: jest.fn() },
    firmMember: { findMany: jest.fn() },
    reviewRound: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    reviewDecision: { create: jest.fn(), findMany: jest.fn() },
  };
  const notifier = { notifyAssigned: jest.fn() };
  const user = { id: 'reviewer-1', firmId: 'firm-1' } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentReviewService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AssignmentNotifierService, useValue: notifier },
      ],
    }).compile();
    service = module.get(DocumentReviewService);
  });

  const baseRound = {
    id: 'round-1',
    documentVersionId: 'version-1',
    reviewerIds: ['reviewer-1', 'reviewer-2'],
    approvalRule: 'ALL',
    status: 'WAITING_REVIEW',
    createdById: 'author',
    documentVersion: { document: { filename: 'คำฟ้อง.docx' } },
    decisions: [],
  };

  describe('recordDecision', () => {
    it('rejects a decision against a stale document version', async () => {
      mockPrisma.reviewRound.findFirst.mockResolvedValue(baseRound);

      await expect(
        service.recordDecision(user, 'case-1', 'doc-1', 'round-1', {
          action: 'approve',
          reviewedDocumentVersionId: 'version-OLD',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.reviewDecision.create).not.toHaveBeenCalled();
    });

    it('rejects a return with no reason', async () => {
      mockPrisma.reviewRound.findFirst.mockResolvedValue(baseRound);

      await expect(
        service.recordDecision(user, 'case-1', 'doc-1', 'round-1', {
          action: 'return',
          reviewedDocumentVersionId: 'version-1',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a reviewer who is not on the round', async () => {
      mockPrisma.reviewRound.findFirst.mockResolvedValue(baseRound);
      const outsider = { id: 'outsider-1', firmId: 'firm-1' } as any;

      await expect(
        service.recordDecision(outsider, 'case-1', 'doc-1', 'round-1', {
          action: 'approve',
          reviewedDocumentVersionId: 'version-1',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('is idempotent — a reviewer who already decided cannot record a second decision', async () => {
      mockPrisma.reviewRound.findFirst.mockResolvedValue({
        ...baseRound,
        decisions: [{ reviewerId: 'reviewer-1', decision: 'APPROVED' }],
      });

      await service.recordDecision(user, 'case-1', 'doc-1', 'round-1', {
        action: 'approve',
        reviewedDocumentVersionId: 'version-1',
      });

      expect(mockPrisma.reviewDecision.create).not.toHaveBeenCalled();
    });

    it('does not mark the round approved until every reviewer has approved', async () => {
      mockPrisma.reviewRound.findFirst.mockResolvedValue(baseRound);
      mockPrisma.reviewDecision.findMany.mockResolvedValue([
        { reviewerId: 'reviewer-1', decision: 'APPROVED' },
      ]);

      await service.recordDecision(user, 'case-1', 'doc-1', 'round-1', {
        action: 'approve',
        reviewedDocumentVersionId: 'version-1',
      });

      expect(mockPrisma.reviewRound.update).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'APPROVED' } }),
      );
      expect(mockPrisma.documentVersion.update).not.toHaveBeenCalled();
    });

    it('marks the round and version APPROVED once all required reviewers approve', async () => {
      mockPrisma.reviewRound.findFirst.mockResolvedValue(baseRound);
      mockPrisma.reviewDecision.findMany.mockResolvedValue([
        { reviewerId: 'reviewer-1', decision: 'APPROVED' },
        { reviewerId: 'reviewer-2', decision: 'APPROVED' },
      ]);

      await service.recordDecision(user, 'case-1', 'doc-1', 'round-1', {
        action: 'approve',
        reviewedDocumentVersionId: 'version-1',
      });

      expect(mockPrisma.reviewRound.update).toHaveBeenCalledWith({
        where: { id: 'round-1' },
        data: { status: 'APPROVED' },
      });
      expect(mockPrisma.documentVersion.update).toHaveBeenCalledWith({
        where: { id: 'version-1' },
        data: { status: 'APPROVED' },
      });
    });

    it('a return sets the round RETURNED and the version RETURNED_FOR_CHANGES', async () => {
      mockPrisma.reviewRound.findFirst.mockResolvedValue(baseRound);

      await service.recordDecision(user, 'case-1', 'doc-1', 'round-1', {
        action: 'return',
        reason: 'ตัวเลขไม่ตรงกับคำฟ้อง',
        reviewedDocumentVersionId: 'version-1',
      });

      expect(mockPrisma.reviewRound.update).toHaveBeenCalledWith({
        where: { id: 'round-1' },
        data: { status: 'RETURNED' },
      });
      expect(mockPrisma.documentVersion.update).toHaveBeenCalledWith({
        where: { id: 'version-1' },
        data: { status: 'RETURNED_FOR_CHANGES' },
      });
    });
  });

  describe('createReviewRound', () => {
    it('refuses to open a new round on an already-approved version', async () => {
      mockPrisma.documentVersion.findFirst.mockResolvedValue({
        id: 'version-1',
        status: 'APPROVED',
        document: { caseId: 'case-1' },
      });

      await expect(
        service.createReviewRound(user, 'case-1', 'doc-1', 'version-1', {
          documentVersionId: 'version-1',
          reviewerIds: ['reviewer-1'],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a reviewer who is not a member of the case', async () => {
      mockPrisma.documentVersion.findFirst.mockResolvedValue({
        id: 'version-1',
        status: 'DRAFT',
        document: { caseId: 'case-1' },
      });
      mockPrisma.case.findFirst.mockResolvedValue({
        leadLawyer: { id: 'lead-1' },
        assignments: [],
      });
      mockPrisma.firmMember.findMany.mockResolvedValue([]);

      await expect(
        service.createReviewRound(user, 'case-1', 'doc-1', 'version-1', {
          documentVersionId: 'version-1',
          reviewerIds: ['not-a-member'],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('notices', () => {
    it('tells each reviewer when a round is created', async () => {
      mockPrisma.documentVersion.findFirst.mockResolvedValue({ id: 'version-1', status: 'DRAFT', document: { id: 'doc-1', filename: 'คำฟ้อง.docx', caseId: 'case-1' } });
      mockPrisma.case.findFirst.mockResolvedValue({ id: 'case-1', leadLawyer: null, assignments: [{ user: { id: 'reviewer-1' } }, { user: { id: 'reviewer-2' } }] });
      mockPrisma.firmMember.findMany.mockResolvedValue([]);
      mockPrisma.reviewRound.findFirst.mockResolvedValue({ ...baseRound });
      await service.createReviewRound({ id: 'author', firmId: 'firm-1' } as any, 'case-1', 'doc-1', 'version-1', { reviewerIds: ['reviewer-1', 'reviewer-2'] } as any);
      expect(notifier.notifyAssigned).toHaveBeenCalledWith(expect.objectContaining({
        userIds: ['reviewer-1', 'reviewer-2'], summaryText: expect.stringContaining('คำฟ้อง.docx'),
      }));
    });

    it('tells the creator when a round is returned', async () => {
      mockPrisma.reviewRound.findFirst.mockResolvedValue({ ...baseRound, createdById: 'author', documentVersion: { document: { filename: 'คำฟ้อง.docx' } } });
      await service.recordDecision(user, 'case-1', 'doc-1', 'round-1', { action: 'return', reason: 'แก้ข้อ 2', reviewedDocumentVersionId: 'version-1' } as any);
      expect(notifier.notifyAssigned).toHaveBeenCalledWith(expect.objectContaining({
        userIds: ['author'], summaryText: expect.stringContaining('ส่งกลับ'),
      }));
    });

    it('tells the creator only when the last approval closes the round', async () => {
      mockPrisma.reviewRound.findFirst.mockResolvedValue({ ...baseRound, createdById: 'author', documentVersion: { document: { filename: 'คำฟ้อง.docx' } } });
      mockPrisma.reviewDecision.findMany.mockResolvedValue([{ decision: 'APPROVED' }]);
      await service.recordDecision(user, 'case-1', 'doc-1', 'round-1', { action: 'approve', reviewedDocumentVersionId: 'version-1' } as any);
      expect(notifier.notifyAssigned).not.toHaveBeenCalled();
      mockPrisma.reviewDecision.findMany.mockResolvedValue([{ decision: 'APPROVED' }, { decision: 'APPROVED' }]);
      await service.recordDecision({ id: 'reviewer-2', firmId: 'firm-1' } as any, 'case-1', 'doc-1', 'round-1', { action: 'approve', reviewedDocumentVersionId: 'version-1' } as any);
      expect(notifier.notifyAssigned).toHaveBeenCalledWith(expect.objectContaining({ userIds: ['author'], summaryText: expect.stringContaining('ผ่าน') }));
    });
  });
});
