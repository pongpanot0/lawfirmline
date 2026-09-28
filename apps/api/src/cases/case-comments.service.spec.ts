import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { FirmRole } from '@lawfirm/shared';
import { CaseCommentsService } from './case-comments.service';
import { PrismaService } from '../prisma/prisma.module';
import { CaseAccessService } from '../common/services/case-access.service';
import { AssignmentNotifierService } from '../notifications/assignment-notifier.service';

describe('CaseCommentsService', () => {
  let service: CaseCommentsService;
  let mockPrisma: any;
  let mockCaseAccess: any;
  let mockNotifier: any;

  beforeEach(async () => {
    mockPrisma = {
      caseComment: {
        findMany: jest.fn(),
        create: jest.fn(),
        findUnique: jest.fn(),
        delete: jest.fn(),
      },
      firmMember: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
      case: {
        findUnique: jest.fn(),
      },
    };

    mockCaseAccess = {
      canAccessCase: jest.fn(),
    };

    mockNotifier = {
      notifyAssigned: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CaseCommentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CaseAccessService, useValue: mockCaseAccess },
        { provide: AssignmentNotifierService, useValue: mockNotifier },
      ],
    }).compile();

    service = module.get<CaseCommentsService>(CaseCommentsService);
  });

  describe('listComments', () => {
    it('throws NotFoundException when user has no access', async () => {
      const user = { id: 'user-1', firmId: 'firm-1' } as any;
      mockCaseAccess.canAccessCase.mockResolvedValue(false);

      await expect(service.listComments(user, 'case-1')).rejects.toThrow(NotFoundException);
      expect(mockPrisma.caseComment.findMany).not.toHaveBeenCalled();
    });

    it('returns comments ordered by createdAt when user has access', async () => {
      const user = { id: 'user-1', firmId: 'firm-1' } as any;
      mockCaseAccess.canAccessCase.mockResolvedValue(true);
      mockPrisma.caseComment.findMany.mockResolvedValue([
        {
          id: 'comment-1',
          caseId: 'case-1',
          authorId: 'user-2',
          author: { firstName: 'John', lastName: 'Doe' },
          body: 'First comment',
          mentionedUserIds: [],
          createdAt: new Date('2026-09-28T10:00:00Z'),
          updatedAt: new Date('2026-09-28T10:00:00Z'),
        },
      ]);

      const result = await service.listComments(user, 'case-1');

      expect(result).toHaveLength(1);
      expect(result[0].body).toBe('First comment');
      expect(result[0].authorFirstName).toBe('John');
      expect(mockPrisma.caseComment.findMany).toHaveBeenCalledWith({
        where: { caseId: 'case-1' },
        orderBy: { createdAt: 'asc' },
        select: expect.any(Object),
      });
    });
  });

  describe('createComment', () => {
    it('throws NotFoundException when user has no access', async () => {
      const user = { id: 'user-1', firmId: 'firm-1' } as any;
      mockCaseAccess.canAccessCase.mockResolvedValue(false);

      await expect(service.createComment(user, 'case-1', 'Test comment')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws error when body is empty', async () => {
      const user = { id: 'user-1', firmId: 'firm-1' } as any;
      mockCaseAccess.canAccessCase.mockResolvedValue(true);

      await expect(service.createComment(user, 'case-1', '')).rejects.toThrow(
        'Comment body must be between 1 and 5000 characters',
      );
    });

    it('throws error when body exceeds 5000 characters', async () => {
      const user = { id: 'user-1', firmId: 'firm-1' } as any;
      mockCaseAccess.canAccessCase.mockResolvedValue(true);

      const longBody = 'a'.repeat(5001);
      await expect(service.createComment(user, 'case-1', longBody)).rejects.toThrow(
        'Comment body must be between 1 and 5000 characters',
      );
    });

    it('filters mentioned users to only firm members', async () => {
      const user = { id: 'user-1', firmId: 'firm-1' } as any;
      mockCaseAccess.canAccessCase.mockResolvedValue(true);
      mockPrisma.firmMember.findMany.mockResolvedValue([
        { userId: 'user-2' }, // Only user-2 is a firm member
      ]);
      mockPrisma.caseComment.create.mockResolvedValue({
        id: 'comment-1',
        caseId: 'case-1',
        authorId: 'user-1',
        author: { firstName: 'Jane', lastName: 'Smith' },
        body: 'Test comment',
        mentionedUserIds: ['user-2'],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await service.createComment(user, 'case-1', 'Test comment', ['user-2', 'user-3']);

      expect(mockPrisma.caseComment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            mentionedUserIds: ['user-2'],
          }),
        }),
      );
    });

    it('caps mentions at 20 users', async () => {
      const user = { id: 'user-1', firmId: 'firm-1' } as any;
      mockCaseAccess.canAccessCase.mockResolvedValue(true);
      mockPrisma.firmMember.findMany.mockResolvedValue([]);
      mockPrisma.caseComment.create.mockResolvedValue({
        id: 'comment-1',
        caseId: 'case-1',
        authorId: 'user-1',
        author: { firstName: 'Jane', lastName: 'Smith' },
        body: 'Test comment',
        mentionedUserIds: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const mentionedIds = Array.from({ length: 25 }, (_, i) => `user-${i}`);
      await service.createComment(user, 'case-1', 'Test comment', mentionedIds);

      expect(mockPrisma.firmMember.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: { in: mentionedIds.slice(0, 20) },
          }),
        }),
      );
    });
  });

  describe('deleteComment', () => {
    it('throws NotFoundException when user has no access to case', async () => {
      const user = { id: 'user-1', firmId: 'firm-1' } as any;
      mockCaseAccess.canAccessCase.mockResolvedValue(false);

      await expect(service.deleteComment(user, 'case-1', 'comment-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException when comment not found', async () => {
      const user = { id: 'user-1', firmId: 'firm-1' } as any;
      mockCaseAccess.canAccessCase.mockResolvedValue(true);
      mockPrisma.caseComment.findUnique.mockResolvedValue(null);

      await expect(service.deleteComment(user, 'case-1', 'comment-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('allows author to delete own comment', async () => {
      const user = { id: 'user-1', firmId: 'firm-1' } as any;
      mockCaseAccess.canAccessCase.mockResolvedValue(true);
      mockPrisma.caseComment.findUnique.mockResolvedValue({
        authorId: 'user-1',
        caseId: 'case-1',
      });
      mockPrisma.firmMember.findFirst.mockResolvedValue({
        role: 'LAWYER',
      });

      await service.deleteComment(user, 'case-1', 'comment-1');

      expect(mockPrisma.caseComment.delete).toHaveBeenCalledWith({
        where: { id: 'comment-1' },
      });
    });

    it('allows firm owner to delete any comment', async () => {
      const user = { id: 'user-1', firmId: 'firm-1' } as any;
      mockCaseAccess.canAccessCase.mockResolvedValue(true);
      mockPrisma.caseComment.findUnique.mockResolvedValue({
        authorId: 'user-2',
        caseId: 'case-1',
      });
      mockPrisma.firmMember.findFirst.mockResolvedValue({
        role: 'OWNER',
      });

      await service.deleteComment(user, 'case-1', 'comment-1');

      expect(mockPrisma.caseComment.delete).toHaveBeenCalledWith({
        where: { id: 'comment-1' },
      });
    });

    it('denies non-author non-owner from deleting', async () => {
      const user = { id: 'user-1', firmId: 'firm-1' } as any;
      mockCaseAccess.canAccessCase.mockResolvedValue(true);
      mockPrisma.caseComment.findUnique.mockResolvedValue({
        authorId: 'user-2',
        caseId: 'case-1',
      });
      mockPrisma.firmMember.findFirst.mockResolvedValue({
        role: 'LAWYER',
      });

      await expect(service.deleteComment(user, 'case-1', 'comment-1')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
