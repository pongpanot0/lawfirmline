import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module';
import { CaseAccessService } from '../common/services/case-access.service';
import { AuthUser } from '@lawfirm/shared';
import { AssignmentNotifierService } from '../notifications/assignment-notifier.service';

export interface CaseCommentDTO {
  id: string;
  caseId: string;
  authorId: string;
  authorFirstName: string;
  authorLastName: string;
  body: string;
  mentionedUserIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class CaseCommentsService {
  private readonly logger = new Logger(CaseCommentsService.name);

  constructor(
    private prisma: PrismaService,
    private caseAccess: CaseAccessService,
    private notifier: AssignmentNotifierService,
  ) {}

  async listComments(user: AuthUser, caseId: string): Promise<CaseCommentDTO[]> {
    // Verify access via CaseAccessService
    const hasAccess = await this.caseAccess.canAccessCase(user, caseId);
    if (!hasAccess) {
      return [];
    }

    const comments = await this.prisma.caseComment.findMany({
      where: { caseId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        caseId: true,
        authorId: true,
        author: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
        body: true,
        mentionedUserIds: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return comments.map((c) => ({
      id: c.id,
      caseId: c.caseId,
      authorId: c.authorId,
      authorFirstName: c.author.firstName,
      authorLastName: c.author.lastName,
      body: c.body,
      mentionedUserIds: c.mentionedUserIds,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));
  }

  async createComment(
    user: AuthUser,
    caseId: string,
    body: string,
    mentionedUserIds?: string[],
  ): Promise<CaseCommentDTO> {
    // Verify access and that body is valid
    const hasAccess = await this.caseAccess.canAccessCase(user, caseId);
    if (!hasAccess) {
      throw new Error('No access to case');
    }

    if (!body || body.trim().length === 0 || body.length > 5000) {
      throw new Error('Comment body must be between 1 and 5000 characters');
    }

    // Filter mentioned users to only those in the same firm
    let validMentioned: string[] = [];
    if (mentionedUserIds && mentionedUserIds.length > 0) {
      const firmMembers = await this.prisma.firmMember.findMany({
        where: {
          firmId: user.firmId,
          userId: { in: mentionedUserIds.slice(0, 20) }, // Max 20 mentions
        },
        select: { userId: true },
      });
      validMentioned = firmMembers.map((m) => m.userId);
    }

    const comment = await this.prisma.caseComment.create({
      data: {
        caseId,
        authorId: user.id,
        body: body.trim(),
        mentionedUserIds: validMentioned,
      },
      select: {
        id: true,
        caseId: true,
        authorId: true,
        author: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
        body: true,
        mentionedUserIds: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Send notifications (fire and forget)
    this.sendNotifications(user, caseId, validMentioned).catch((err) => {
      this.logger.error('Failed to send comment notifications', err);
    });

    return {
      id: comment.id,
      caseId: comment.caseId,
      authorId: comment.authorId,
      authorFirstName: comment.author.firstName,
      authorLastName: comment.author.lastName,
      body: comment.body,
      mentionedUserIds: comment.mentionedUserIds,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
    };
  }

  private async sendNotifications(
    user: AuthUser,
    caseId: string,
    mentionedUserIds: string[],
  ): Promise<void> {
    // Get case to find lead lawyer
    const legalCase = await this.prisma.case.findUnique({
      where: { id: caseId },
      select: {
        ownRef: true,
        leadLawyerId: true,
        assignments: {
          select: { userId: true },
        },
      },
    });

    if (!legalCase) return;

    // Recipients = case team + mentioned users, minus author
    const caseTeam = [legalCase.leadLawyerId, ...legalCase.assignments.map((a) => a.userId)];
    const allRecipients = [...new Set([...caseTeam, ...mentionedUserIds])].filter(
      (id) => id !== user.id,
    );

    if (allRecipients.length === 0) return;

    // Split notifications: mentioned vs others
    const mentionedSet = new Set(mentionedUserIds);
    const mentionedRecipients = allRecipients.filter((id) => mentionedSet.has(id));
    const otherRecipients = allRecipients.filter((id) => !mentionedSet.has(id));

    // Notify mentioned users
    if (mentionedRecipients.length > 0) {
      await this.notifier.notifyAssigned({
        firmId: user.firmId,
        userIds: mentionedRecipients,
        actorUserId: user.id,
        summaryText: `${user.firstName ?? 'User'} กล่าวถึงคุณในคดี ${legalCase.ownRef}`,
        entityPath: `/cases/${caseId}?tab=comments`,
      });
    }

    // Notify other case team members
    if (otherRecipients.length > 0) {
      await this.notifier.notifyAssigned({
        firmId: user.firmId,
        userIds: otherRecipients,
        actorUserId: user.id,
        summaryText: `ความคิดเห็นใหม่ในคดี ${legalCase.ownRef}`,
        entityPath: `/cases/${caseId}?tab=comments`,
      });
    }
  }

  async deleteComment(user: AuthUser, caseId: string, commentId: string): Promise<void> {
    // Verify access to case
    const hasAccess = await this.caseAccess.canAccessCase(user, caseId);
    if (!hasAccess) {
      throw new Error('No access to case');
    }

    const comment = await this.prisma.caseComment.findUnique({
      where: { id: commentId },
      select: { authorId: true, caseId: true },
    });

    if (!comment || comment.caseId !== caseId) {
      throw new Error('Comment not found');
    }

    // Only author or firm owner can delete
    const firmMember = await this.prisma.firmMember.findFirst({
      where: { firmId: user.firmId, userId: user.id },
      select: { role: true },
    });

    const isAuthor = comment.authorId === user.id;
    const isOwner = firmMember?.role === 'OWNER';

    if (!isAuthor && !isOwner) {
      throw new Error('No permission to delete comment');
    }

    await this.prisma.caseComment.delete({
      where: { id: commentId },
    });
  }
}
