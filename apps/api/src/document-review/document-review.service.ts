import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser, FirmRole } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { DocumentVersionStatus, ReviewDecisionType, ReviewRoundStatus } from '../generated/prisma';
import { CreateReviewRoundDto, ReviewDecisionDto } from './dto/document-review.dto';

const roundInclude = {
  decisions: { orderBy: { decidedAt: 'desc' as const } },
  documentVersion: true,
};

@Injectable()
export class DocumentReviewService {
  constructor(private prisma: PrismaService) {}

  private async getVersionOrThrow(caseId: string, documentId: string, documentVersionId: string) {
    const version = await this.prisma.documentVersion.findFirst({
      where: { id: documentVersionId, documentId, document: { caseId } },
      include: { document: true },
    });
    if (!version) throw new NotFoundException('ไม่พบเอกสารฉบับนี้');
    return version;
  }

  /**
   * Reviewers/editors must already have access to the case — this only
   * narrows the picker to firm members who are staffed on it (owner,
   * lead lawyer, or an explicit case assignment). It never grants new
   * case access on its own.
   */
  private static readonly SAFE_USER_SELECT = { id: true, firstName: true, lastName: true, email: true } as const;

  async listEligibleMembers(user: AuthUser, caseId: string) {
    const legalCase = await this.prisma.case.findFirst({
      where: { id: caseId, firmId: user.firmId },
      include: {
        assignments: { include: { user: { select: DocumentReviewService.SAFE_USER_SELECT } } },
        leadLawyer: { select: DocumentReviewService.SAFE_USER_SELECT },
      },
    });
    if (!legalCase) throw new NotFoundException('ไม่พบคดีนี้');

    const owners = await this.prisma.firmMember.findMany({
      where: { firmId: user.firmId, role: FirmRole.OWNER },
      include: { user: { select: DocumentReviewService.SAFE_USER_SELECT } },
    });

    const byId = new Map<string, { id: string; firstName: string; lastName: string }>();
    if (legalCase.leadLawyer) byId.set(legalCase.leadLawyer.id, legalCase.leadLawyer);
    for (const assignment of legalCase.assignments) byId.set(assignment.user.id, assignment.user);
    for (const owner of owners) byId.set(owner.user.id, owner.user);

    return Array.from(byId.values());
  }

  private async assertCaseMembers(user: AuthUser, caseId: string, userIds: string[]) {
    if (userIds.length === 0) return;
    const eligible = await this.listEligibleMembers(user, caseId);
    const eligibleIds = new Set(eligible.map((member) => member.id));
    const invalid = userIds.filter((id) => !eligibleIds.has(id));
    if (invalid.length > 0) {
      throw new BadRequestException('เลือกได้เฉพาะสมาชิกที่มีสิทธิ์ในคดีนี้เท่านั้น');
    }
  }

  async listForDocument(caseId: string, documentId: string) {
    return this.prisma.reviewRound.findMany({
      where: { documentVersion: { documentId, document: { caseId } } },
      include: roundInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async createReviewRound(
    user: AuthUser,
    caseId: string,
    documentId: string,
    documentVersionId: string,
    dto: CreateReviewRoundDto,
  ) {
    const version = await this.getVersionOrThrow(caseId, documentId, documentVersionId);
    if (version.status === DocumentVersionStatus.APPROVED) {
      throw new BadRequestException('ฉบับนี้ผ่านการตรวจแล้ว หากต้องแก้ไขต้องสร้างฉบับใหม่');
    }

    await this.assertCaseMembers(user, caseId, [...dto.reviewerIds, ...(dto.editorIds ?? [])]);

    await this.prisma.reviewRound.create({
      data: {
        documentVersionId,
        reviewerIds: dto.reviewerIds,
        editorIds: dto.editorIds ?? [],
        approvalRule: dto.approvalRule ?? 'ALL',
        scope: dto.scope,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
        createdById: user.id,
      },
    });

    await this.prisma.documentVersion.update({
      where: { id: documentVersionId },
      data: { status: DocumentVersionStatus.WAITING_REVIEW },
    });

    return this.getReviewRound(caseId, documentId, (
      await this.prisma.reviewRound.findFirst({
        where: { documentVersionId },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      })
    )!.id);
  }

  async getReviewRound(caseId: string, documentId: string, roundId: string) {
    const round = await this.prisma.reviewRound.findFirst({
      where: { id: roundId, documentVersion: { documentId, document: { caseId } } },
      include: roundInclude,
    });
    if (!round) throw new NotFoundException('ไม่พบรอบตรวจนี้');
    return round;
  }

  /**
   * Approve or return a review round. `reviewedDocumentVersionId` must match
   * the round's current version — if an editor uploaded a newer version
   * while the reviewer had this page open, the decision is rejected instead
   * of silently applying to the stale version.
   */
  async recordDecision(
    user: AuthUser,
    caseId: string,
    documentId: string,
    roundId: string,
    dto: ReviewDecisionDto,
  ) {
    const round = await this.getReviewRound(caseId, documentId, roundId);

    if (!round.reviewerIds.includes(user.id)) {
      throw new ForbiddenException('คุณไม่ได้อยู่ในรายชื่อผู้ตรวจของรอบนี้');
    }

    const existingDecision = round.decisions.find((decision) => decision.reviewerId === user.id);
    if (existingDecision) {
      // Idempotent: this reviewer already recorded a decision on this round —
      // a repeated click (double submit, back-button resubmit) must not
      // create a second row, re-run the approval count, or error out just
      // because the round has since closed as a result of that decision.
      return this.getReviewRound(caseId, documentId, roundId);
    }
    if (round.status !== ReviewRoundStatus.WAITING_REVIEW) {
      throw new BadRequestException('รอบตรวจนี้ปิดแล้ว');
    }
    if (round.documentVersionId !== dto.reviewedDocumentVersionId) {
      throw new BadRequestException(
        'เอกสารถูกแก้เป็นฉบับใหม่ระหว่างที่เปิดหน้านี้ กรุณาเปิดฉบับล่าสุดก่อนตรวจ',
      );
    }
    if (dto.action === 'return' && !dto.reason?.trim()) {
      throw new BadRequestException('กรุณาระบุเหตุผลที่ส่งกลับแก้ไข');
    }

    await this.prisma.reviewDecision.create({
      data: {
        reviewRoundId: roundId,
        reviewerId: user.id,
        decision: dto.action === 'approve' ? ReviewDecisionType.APPROVED : ReviewDecisionType.RETURNED,
        reason: dto.reason,
      },
    });

    if (dto.action === 'return') {
      await this.prisma.reviewRound.update({ where: { id: roundId }, data: { status: ReviewRoundStatus.RETURNED } });
      await this.prisma.documentVersion.update({
        where: { id: round.documentVersionId },
        data: { status: DocumentVersionStatus.RETURNED_FOR_CHANGES },
      });
      return this.getReviewRound(caseId, documentId, roundId);
    }

    const decisions = await this.prisma.reviewDecision.findMany({ where: { reviewRoundId: roundId } });
    const approvedCount = decisions.filter((decision) => decision.decision === ReviewDecisionType.APPROVED).length;
    const allApproved =
      round.approvalRule === 'ANY_ONE' ? approvedCount >= 1 : approvedCount >= round.reviewerIds.length;

    if (allApproved) {
      await this.prisma.reviewRound.update({ where: { id: roundId }, data: { status: ReviewRoundStatus.APPROVED } });
      await this.prisma.documentVersion.update({
        where: { id: round.documentVersionId },
        data: { status: DocumentVersionStatus.APPROVED },
      });
    }

    return this.getReviewRound(caseId, documentId, roundId);
  }
}
