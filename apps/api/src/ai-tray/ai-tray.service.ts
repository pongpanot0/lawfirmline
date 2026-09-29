import { Injectable, NotFoundException } from '@nestjs/common';
import { AI_CREDIT_COST, DOCUMENT_ANALYSIS_MIME_TYPES, DateSuggestionStatus, AuthUser } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { CaseAccessService } from '../common/services/case-access.service';

export type AiTrayCard =
  | { type: 'UNREAD_DOCUMENTS'; caseId: string; caseTitle: string; caseRef: string | null;
      documents: { id: string; filename: string; createdAt: string }[]; creditCost: number }
  | { type: 'PENDING_DATES'; caseId: string; caseTitle: string; caseRef: string | null; count: number };

/** จับวัน + สรุป ต่อหนึ่งไฟล์ */
const CREDITS_PER_DOCUMENT = AI_CREDIT_COST.DOCUMENT_ANALYSIS * 2;

/**
 * งานที่ AI เตรียมไว้ให้ — คำนวณสดจากข้อมูลเดิม ไม่รัน AI เอง (ผู้ใช้กดเท่านั้น).
 * เพดานจำนวนแถวกันคำขอใหญ่เกิน: ถาดคือรายการที่ควรทำ ไม่ใช่รายงานครบถ้วน.
 */
@Injectable()
export class AiTrayService {
  constructor(private prisma: PrismaService, private access: CaseAccessService) {}

  async list(user: AuthUser, caseId?: string): Promise<AiTrayCard[]> {
    const caseFilter = this.access.getCaseFilterForUser(user);
    const caseSelect = { select: { id: true, title: true, ownRef: true } } as const;
    const [documents, pendingDates] = await Promise.all([
      this.prisma.document.findMany({
        where: {
          caseId: caseId ?? { not: null },
          case: caseFilter,
          aiTrayHandledAt: null,
          mimeType: { in: [...DOCUMENT_ANALYSIS_MIME_TYPES] },
          knowledge: { none: {} },
        },
        select: { id: true, filename: true, createdAt: true, caseId: true, case: caseSelect },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      this.prisma.documentDateSuggestion.findMany({
        where: { caseId: caseId ?? undefined, status: DateSuggestionStatus.PENDING, case: caseFilter },
        select: { caseId: true, case: caseSelect },
        take: 500,
      }),
    ]);

    const cards: AiTrayCard[] = [];
    const docCards = new Map<string, Extract<AiTrayCard, { type: 'UNREAD_DOCUMENTS' }>>();
    for (const d of documents) {
      if (!d.caseId || !d.case) continue;
      let card = docCards.get(d.caseId);
      if (!card) {
        card = { type: 'UNREAD_DOCUMENTS', caseId: d.caseId, caseTitle: d.case.title, caseRef: d.case.ownRef, documents: [], creditCost: 0 };
        docCards.set(d.caseId, card);
        cards.push(card);
      }
      card.documents.push({ id: d.id, filename: d.filename, createdAt: d.createdAt.toISOString() });
      card.creditCost += CREDITS_PER_DOCUMENT;
    }
    const dateCards = new Map<string, Extract<AiTrayCard, { type: 'PENDING_DATES' }>>();
    for (const s of pendingDates) {
      let card = dateCards.get(s.caseId);
      if (!card) {
        card = { type: 'PENDING_DATES', caseId: s.caseId, caseTitle: s.case.title, caseRef: s.case.ownRef, count: 0 };
        dateCards.set(s.caseId, card);
        cards.push(card);
      }
      card.count += 1;
    }
    return cards;
  }

  async markHandled(user: AuthUser, documentIds: string[]): Promise<{ handled: number }> {
    const reachable = await this.prisma.document.findMany({
      where: { id: { in: documentIds }, case: this.access.getCaseFilterForUser(user) },
      select: { id: true },
    });
    if (reachable.length !== new Set(documentIds).size) throw new NotFoundException('ไม่พบเอกสาร');
    const { count } = await this.prisma.document.updateMany({ where: { id: { in: documentIds } }, data: { aiTrayHandledAt: new Date() } });
    return { handled: count };
  }
}
