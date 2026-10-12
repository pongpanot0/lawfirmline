import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { AuthUser, ConflictResult, INTAKE_STAGE_ORDER, IntakeStage, TMP_CLIENT_PLACEHOLDER } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { CONFLICT_TERM_MIN_LENGTH, ConflictSearchDto, RecordConflictCheckDto } from './dto/conflict-check.dto';

export type ConflictMatchKind =
  | 'CLIENT'
  | 'CLIENT_CONTACT'
  | 'CASE_PARTY'
  | 'CASE_CLIENT_NAME'
  | 'INTAKE_PARTY'
  /** ลูกความร่วมในคดี (CaseClient) — ฝ่ายเราเสมอ */
  | 'CASE_CLIENT';

export interface ConflictMatch {
  kind: ConflictMatchKind;
  /** คำค้นที่ทำให้เจอรายการนี้ — ทนายต้องรู้ว่าตรงเพราะอะไร */
  term: string;
  name: string;
  /** ฝ่ายของชื่อนี้: ลูกความเรา (OURS) หรือคู่กรณี (OPPONENT) — ตัวชี้ conflict ที่สำคัญที่สุด */
  side?: string;
  role?: string;
  caseId?: string;
  caseTitle?: string;
  ownRef?: string;
  caseStatus?: string;
  intakeId?: string;
  intakeTitle?: string;
  clientId?: string;
}

export interface PartyName {
  name: string;
  side: 'OURS' | 'OPPONENT';
}

export interface ConflictGate {
  result: ConflictResult.CLEAR | ConflictResult.POTENTIAL_CONFLICT;
  terms: string[];
  matches: ConflictMatch[];
  overrideReason: string | null;
}

const OVERRIDE_MIN_LENGTH = 10;

/** Spec L6: a searched name found on the other side somewhere else. Same-side and neutral hits are not conflicts. */
export function opponentConflicts(searched: PartyName[], matches: ConflictMatch[]): ConflictMatch[] {
  const sideOf = new Map(searched.map((p) => [p.name.trim().toLowerCase(), p.side]));
  return matches.filter((m) => {
    const side = sideOf.get(m.term.trim().toLowerCase());
    return !!side && (m.side === 'OURS' || m.side === 'OPPONENT') && m.side !== side;
  });
}

@Injectable()
export class ConflictCheckService {
  constructor(private prisma: PrismaService) {}

  /**
   * ค้นชื่อทั่วทั้งสำนักงาน: ลูกความ, ผู้ติดต่อของลูกความ, คู่กรณี/ผู้เกี่ยวข้อง
   * ในทุกคดี และเรื่องรับใหม่ทุกเรื่อง
   *
   * ใช้สองงานด้วย service เดียว เพราะเป็นคำถามเดียวกัน:
   *   - conflict check ก่อนรับคดี ("ชื่อนี้เคยอยู่ฝ่ายตรงข้ามของเราไหม")
   *   - "นาย ก. เกี่ยวข้องกับคดีไหนบ้าง" ในหน้าคดี
   *
   * ไม่ตัดสินให้ — คืนสิ่งที่เจอ พร้อม `suggestedResult` เป็นข้อเสนอเท่านั้น
   */
  async search(user: AuthUser, terms: string[]) {
    const cleaned = [...new Set(terms.map((t) => t.trim()).filter(Boolean))];
    if (!cleaned.length) {
      throw new BadRequestException('ต้องมีคำค้นอย่างน้อยหนึ่งคำ');
    }

    const matches: ConflictMatch[] = [];

    for (const term of cleaned) {
      const like = { contains: term, mode: 'insensitive' as const };

      const [clients, contacts, parties, casesByClientName, intakes, caseClients] = await Promise.all([
        this.prisma.client.findMany({
          where: { firmId: user.firmId, name: like },
          select: { id: true, name: true },
          take: 20,
        }),
        this.prisma.clientContact.findMany({
          where: { client: { firmId: user.firmId }, name: like },
          select: { id: true, name: true, clientId: true, client: { select: { name: true } } },
          take: 20,
        }),
        this.prisma.caseParticipant.findMany({
          where: { case: { firmId: user.firmId }, name: like },
          select: {
            id: true,
            name: true,
            role: true,
            side: true,
            case: { select: { id: true, title: true, ownRef: true, status: true } },
          },
          take: 50,
        }),
        this.prisma.case.findMany({
          where: { firmId: user.firmId, clientName: like },
          select: { id: true, title: true, ownRef: true, status: true, clientName: true },
          take: 20,
        }),
        this.prisma.intake.findMany({
          where: {
            firmId: user.firmId,
            OR: [{ clientName: like }, { opposingParty: like }, { contactName: like }, { referralName: like }],
          },
          select: {
            id: true,
            title: true,
            clientName: true,
            opposingParty: true,
            contactName: true,
            status: true,
          },
          take: 20,
        }),
        this.prisma.caseClient.findMany({
          where: { case: { firmId: user.firmId }, client: { name: like } },
          select: {
            client: { select: { id: true, name: true } },
            case: { select: { id: true, title: true, ownRef: true, status: true } },
          },
          take: 20,
        }),
      ]);

      for (const c of clients) {
        matches.push({ kind: 'CLIENT', term, name: c.name, side: 'OURS', clientId: c.id });
      }
      for (const c of contacts) {
        matches.push({
          kind: 'CLIENT_CONTACT',
          term,
          name: c.name,
          side: 'OURS',
          clientId: c.clientId,
          role: c.client?.name,
        });
      }
      for (const p of parties) {
        matches.push({
          kind: 'CASE_PARTY',
          term,
          name: p.name,
          side: p.side,
          role: p.role,
          caseId: p.case.id,
          caseTitle: p.case.title,
          ownRef: p.case.ownRef,
          caseStatus: p.case.status,
        });
      }
      for (const k of casesByClientName) {
        matches.push({
          kind: 'CASE_CLIENT_NAME',
          term,
          name: k.clientName ?? '',
          side: 'OURS',
          caseId: k.id,
          caseTitle: k.title,
          ownRef: k.ownRef,
          caseStatus: k.status,
        });
      }
      for (const k of caseClients) {
        matches.push({
          kind: 'CASE_CLIENT',
          term,
          name: k.client.name,
          side: 'OURS',
          clientId: k.client.id,
          caseId: k.case.id,
          caseTitle: k.case.title,
          ownRef: k.case.ownRef,
          caseStatus: k.case.status,
        });
      }
      for (const i of intakes) {
        const opposing = i.opposingParty && matchesTerm(i.opposingParty, term);
        matches.push({
          kind: 'INTAKE_PARTY',
          term,
          name: (opposing ? i.opposingParty : i.clientName || i.contactName) ?? '',
          side: opposing ? 'OPPONENT' : 'OURS',
          intakeId: i.id,
          intakeTitle: i.title ?? undefined,
        });
      }
    }

    return {
      terms: cleaned,
      matches,
      matchCount: matches.length,
      suggestedResult: suggestResult(matches),
    };
  }

  /** เก็บผลการตรวจไว้เป็นหลักฐาน: ค้นด้วยอะไร เจออะไร ใครตัดสิน ตัดสินว่าอะไร */
  async record(user: AuthUser, dto: RecordConflictCheckDto) {
    if (dto.intakeId) {
      const intake = await this.prisma.intake.findFirst({
        where: { id: dto.intakeId, firmId: user.firmId },
        select: { id: true },
      });
      if (!intake) throw new BadRequestException('ไม่พบเรื่องรับใหม่นี้ในสำนักงาน');
    }

    const found = await this.search(user, dto.terms);

    const created = await this.prisma.conflictCheck.create({
      data: {
        firmId: user.firmId,
        intakeId: dto.intakeId,
        searchTerms: found.terms,
        matches: found.matches as unknown as object,
        matchCount: found.matchCount,
        result: dto.result as never,
        notes: dto.notes,
        checkedById: user.id,
      },
      include: { checkedBy: { select: { firstName: true, lastName: true } } },
    });
    if (dto.intakeId) await this.advanceIntakeToConflictCheck(user, dto.intakeId);
    return created;
  }

  /**
   * Runs before a case is opened. Names too short to search meaningfully, and the
   * "tmp" placeholder client, are skipped — the search itself would 400 on them.
   */
  async gateNewCase(
    user: AuthUser,
    input: { parties: PartyName[]; overrideReason?: string | null; excludeIntakeId?: string },
  ): Promise<ConflictGate> {
    const parties = input.parties
      .map((p) => ({ ...p, name: (p.name ?? '').trim() }))
      .filter((p) => p.name.length >= CONFLICT_TERM_MIN_LENGTH && p.name.toLowerCase() !== TMP_CLIENT_PLACEHOLDER);
    if (!parties.length) return { result: ConflictResult.CLEAR, terms: [], matches: [], overrideReason: null };

    const found = await this.search(user, parties.map((p) => p.name));
    const conflicts = opponentConflicts(parties, found.matches).filter(
      (m) => !input.excludeIntakeId || m.intakeId !== input.excludeIntakeId,
    );
    if (!conflicts.length) {
      return { result: ConflictResult.CLEAR, terms: found.terms, matches: found.matches, overrideReason: null };
    }

    const reason = input.overrideReason?.trim() ?? '';
    if (!reason) {
      throw new ConflictException({
        code: 'CONFLICT_FOUND',
        message: 'พบชื่อที่อาจขัดกัน (conflict of interest) — ตรวจรายการแล้วระบุเหตุผลเพื่อเปิดคดีต่อ',
        matches: conflicts,
      });
    }
    if (reason.length < OVERRIDE_MIN_LENGTH) {
      throw new BadRequestException(`เหตุผลที่ข้ามผลตรวจต้องยาวอย่างน้อย ${OVERRIDE_MIN_LENGTH} ตัวอักษร`);
    }
    return { result: ConflictResult.POTENTIAL_CONFLICT, terms: found.terms, matches: conflicts, overrideReason: reason };
  }

  /** เก็บผลของ gate ไว้กับคดี/เรื่องรับที่เพิ่งเปิด; ข้ามผลตรวจ = มี AuditLog */
  async recordForCase(user: AuthUser, gate: ConflictGate, link: { caseId?: string; intakeId?: string }) {
    const check = await this.prisma.conflictCheck.create({
      data: {
        firmId: user.firmId,
        caseId: link.caseId,
        intakeId: link.intakeId,
        searchTerms: gate.terms,
        matches: gate.matches as unknown as object,
        matchCount: gate.matches.length,
        result: gate.result as never,
        notes: gate.overrideReason,
        checkedById: user.id,
      },
    });
    if (gate.result === ConflictResult.POTENTIAL_CONFLICT) {
      await this.prisma.auditLog.create({
        data: {
          firmId: user.firmId,
          userId: user.id,
          action: 'CONFLICT_OVERRIDDEN',
          metadata: {
            conflictCheckId: check.id,
            caseId: link.caseId ?? null,
            intakeId: link.intakeId ?? null,
            reason: gate.overrideReason,
            matchCount: gate.matches.length,
          },
        },
      });
    }
    if (link.intakeId) await this.advanceIntakeToConflictCheck(user, link.intakeId);
  }

  /** Spec L6: recording a check on an intake moves it to CONFLICT_CHECK, never backwards. */
  private async advanceIntakeToConflictCheck(user: AuthUser, intakeId: string) {
    const intake = await this.prisma.intake.findFirst({
      where: { id: intakeId, firmId: user.firmId },
      select: { id: true, stage: true },
    });
    if (!intake) return;
    const index = INTAKE_STAGE_ORDER.indexOf(intake.stage as IntakeStage);
    if (index >= INTAKE_STAGE_ORDER.indexOf(IntakeStage.CONFLICT_CHECK)) return;
    await this.prisma.intake.update({
      where: { id: intakeId },
      data: { stage: IntakeStage.CONFLICT_CHECK as never, stageChangedAt: new Date() },
    });
  }

  list(user: AuthUser, intakeId?: string) {
    return this.prisma.conflictCheck.findMany({
      where: { firmId: user.firmId, ...(intakeId ? { intakeId } : {}) },
      include: { checkedBy: { select: { firstName: true, lastName: true } } },
      orderBy: { checkedAt: 'desc' },
      take: intakeId ? 50 : 100,
    });
  }

  /** ผลตรวจล่าสุดของเรื่องนี้ — ใช้กั้นตอนแปลงเป็นคดี */
  latestForIntake(intakeId: string) {
    return this.prisma.conflictCheck.findFirst({
      where: { intakeId },
      orderBy: { checkedAt: 'desc' },
    });
  }

  async searchFromDto(user: AuthUser, dto: ConflictSearchDto) {
    return this.search(user, dto.terms);
  }
}

function matchesTerm(value: string, term: string) {
  return value.toLowerCase().includes(term.toLowerCase());
}

/**
 * ข้อเสนอ ไม่ใช่คำตัดสิน
 *
 * ชื่อที่โผล่มาเป็นทั้งฝ่ายเราและฝ่ายตรงข้าม = สัญญาณ conflict ที่ชัดที่สุด
 * เจอชื่อแต่อยู่ฝ่ายเดียว = ต้องให้คนดู ไม่ใช่ปล่อยผ่าน
 */
export function suggestResult(matches: ConflictMatch[]): ConflictResult {
  if (!matches.length) return ConflictResult.CLEAR;
  const hasOurs = matches.some((m) => m.side === 'OURS');
  const hasOpponent = matches.some((m) => m.side === 'OPPONENT');
  if (hasOurs && hasOpponent) return ConflictResult.CONFLICT;
  if (hasOpponent) return ConflictResult.POTENTIAL_CONFLICT;
  return ConflictResult.NEEDS_REVIEW;
}
