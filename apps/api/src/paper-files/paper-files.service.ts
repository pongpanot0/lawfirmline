import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser, hasFirmCapability, PaperFileAction } from '@lawfirm/shared';
import { Prisma } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { assertFirmRefs } from '../common/firm-refs';
import { CaseAccessService } from '../common/services/case-access.service';

const personSelect = { id: true, firstName: true, lastName: true } as const;
const stateSelect = {
  id: true,
  folderId: true,
  paperFileHolderId: true,
  paperFileLocation: true,
  paperFileHolder: { select: personSelect },
} as const;

@Injectable()
export class PaperFilesService {
  constructor(private prisma: PrismaService, private caseAccess: CaseAccessService) {}

  checkOut(user: AuthUser, caseId: string, dto: { holderUserId?: string; note?: string }) {
    return this.record(user, caseId, PaperFileAction.CHECK_OUT, dto);
  }

  checkIn(user: AuthUser, caseId: string, dto: { location: string; note?: string }) {
    return this.record(user, caseId, PaperFileAction.CHECK_IN, dto);
  }

  move(user: AuthUser, caseId: string, dto: { location: string; note?: string }) {
    return this.record(user, caseId, PaperFileAction.MOVE, dto);
  }

  private async record(
    user: AuthUser,
    caseId: string,
    action: PaperFileAction,
    dto: { holderUserId?: string; location?: string; note?: string },
  ) {
    const holderUserId = action === PaperFileAction.CHECK_OUT ? dto.holderUserId ?? user.id : null;
    const location = action === PaperFileAction.CHECK_OUT ? null : dto.location?.trim();
    if (action !== PaperFileAction.CHECK_OUT && !location) {
      throw new BadRequestException('กรุณาระบุที่เก็บสำนวน');
    }

    return this.prisma.$transaction(async (tx) => {
      const legalCase = await tx.case.findFirst({
        where: { id: caseId, firmId: user.firmId, deletedAt: null, AND: this.caseAccess.getCaseFilterForUser(user) },
        select: { id: true, paperFileHolderId: true },
      });
      if (!legalCase) throw new NotFoundException('ไม่พบคดี');
      if (action === PaperFileAction.MOVE && legalCase.paperFileHolderId) {
        throw new BadRequestException('กรุณาคืนสำนวนก่อนย้ายที่เก็บ');
      }
      if (holderUserId) await assertFirmRefs(tx, user.firmId, { userIds: [holderUserId] });

      const state = await tx.case.update({
        where: {
          id: caseId, firmId: user.firmId, deletedAt: null,
          // Do not clear a holder if a concurrent checkout happened after the read.
          ...(action === PaperFileAction.MOVE ? { paperFileHolderId: null } : {}),
        },
        data: { paperFileHolderId: holderUserId, paperFileLocation: location ?? null },
        select: stateSelect,
      }).catch((err) => {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
          throw new ConflictException('สำนวนถูกเบิกไปพร้อมกัน กรุณาโหลดใหม่');
        }
        throw err;
      });
      const metadata = { caseId, holderUserId, location: location ?? null, note: dto.note ?? null };
      await tx.paperFileMovement.create({
        data: { firmId: user.firmId, ...metadata, action, createdById: user.id },
      });
      await tx.auditLog.create({
        data: { firmId: user.firmId, userId: user.id, action: `PAPER_FILE_${action}`, metadata },
      });
      return state;
    });
  }

  async history(user: AuthUser, caseId: string, limit = 10) {
    const state = await this.prisma.case.findFirst({
      where: { id: caseId, firmId: user.firmId, AND: this.caseAccess.getCaseFilterForUser(user) },
      select: stateSelect,
    });
    if (!state) throw new NotFoundException('ไม่พบคดี');
    const history = await this.prisma.paperFileMovement.findMany({
      where: { firmId: user.firmId, caseId },
      include: { holder: { select: personSelect }, createdBy: { select: personSelect } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });
    return { ...state, history };
  }

  async resolveFolder(user: AuthUser, folderId: string) {
    const legalCase = await this.prisma.case.findFirst({
      where: { folderId, firmId: user.firmId, AND: this.caseAccess.getCaseFilterForUser(user) },
      select: { id: true },
    });
    if (!legalCase) throw new NotFoundException('ไม่พบสำนวน');
    return { caseId: legalCase.id };
  }

  async listCheckedOut(user: AuthUser, { page = 1, pageSize = 50 }: { page?: number; pageSize?: number }) {
    if (!hasFirmCapability(user.firmRole, 'runOperations')) throw new ForbiddenException('ไม่มีสิทธิ์ดูรายการสำนวน');
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      throw new BadRequestException('เลขหน้าและจำนวนรายการไม่ถูกต้อง');
    }
    const where: Prisma.CaseWhereInput = {
      firmId: user.firmId, deletedAt: null, paperFileHolderId: { not: null },
    };
    const total = await this.prisma.case.count({ where });
    const checkouts = await this.prisma.paperFileMovement.groupBy({
      by: ['caseId'],
      where: { firmId: user.firmId, action: PaperFileAction.CHECK_OUT, case: where },
      _max: { createdAt: true },
      orderBy: [{ _max: { createdAt: 'asc' } }, { caseId: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    const cases = checkouts.length ? await this.prisma.case.findMany({
      where: { ...where, id: { in: checkouts.map((c) => c.caseId) } },
      select: { ...stateSelect, title: true, ownRef: true },
    }) : [];
    const byId = new Map(cases.map((c) => [c.id, c]));
    const now = Date.now();
    const items = checkouts.flatMap((checkout) => {
      const legalCase = byId.get(checkout.caseId);
      const checkedOutAt = checkout._max.createdAt;
      if (!legalCase || !checkedOutAt) return [];
      return [{
        ...legalCase, checkedOutAt,
        daysOut: Math.max(0, Math.floor((now - checkedOutAt.getTime()) / 86_400_000)),
      }];
    });
    return { items, total, page, pageSize };
  }
}
