import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { AuthUser, ConflictResult, INTAKE_STAGE_ORDER, IntakeStage, ParticipantSide, TMP_CLIENT_PLACEHOLDER } from '@lawfirm/shared';
import { Prisma } from '../generated/prisma';
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

/**
 * Gate-side name form: NFKC, any run of whitespace / NBSP / zero-width space → one space.
 * NFKC splits Thai SARA AM (ำ) into NIKHAHIT + SARA AA, which would make "จำกัด" never match a
 * stored name — so it is recomposed straight after.
 * ponytail: only the searched name is normalised; stored names with irregular spacing still slip
 * past `contains` — add a normalised name column if that shows up in practice.
 */
export function normalizeName(name: string): string {
  return name
    .normalize('NFKC')
    .replace(/\u0E4D\u0E32/g, '\u0E33')
    .replace(/[\s\u200B\u00A0]+/g, ' ')
    .trim();
}

/**
 * Spec L6: a searched name found on the other side somewhere else. Same-side and neutral hits are
 * not conflicts. A name supplied on both sides counts as both, so either kind of hit is a clash.
 */
export function opponentConflicts(searched: PartyName[], matches: ConflictMatch[]): ConflictMatch[] {
  const sidesOf = new Map<string, Set<string>>();
  for (const p of searched) {
    const key = p.name.trim().toLowerCase();
    sidesOf.set(key, (sidesOf.get(key) ?? new Set()).add(p.side));
  }
  return matches.filter((m) => {
    const sides = sidesOf.get(m.term.trim().toLowerCase());
    return !!sides && (m.side === 'OURS' || m.side === 'OPPONENT') && [...sides].some((side) => side !== m.side);
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
      .map((p) => ({ ...p, name: normalizeName(p.name ?? '') }))
      .filter((p) => p.name.length >= CONFLICT_TERM_MIN_LENGTH && p.name.toLowerCase() !== TMP_CLIENT_PLACEHOLDER);
    if (!parties.length) return { result: ConflictResult.CLEAR, terms: [], matches: [], overrideReason: null };

    const terms = [...new Set(parties.map((p) => p.name))];
    const conflicts = opponentConflicts(parties, await this.gateHits(user, parties, input.excludeIntakeId));
    if (!conflicts.length) return { result: ConflictResult.CLEAR, terms, matches: [], overrideReason: null };

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
    return { result: ConflictResult.POTENTIAL_CONFLICT, terms, matches: conflicts, overrideReason: reason };
  }

  /**
   * The gate's own lookup — never the display search, whose `take` caps could hide the one
   * clashing row behind many same-side ones. Our names are looked up only where they would be
   * an opponent, opponents only where they would be ours: one uncapped query per table with an
   * OR over all names, then hits are assigned to names here.
   */
  private async gateHits(user: AuthUser, parties: PartyName[], excludeIntakeId?: string): Promise<ConflictMatch[]> {
    const ours = [...new Set(parties.filter((p) => p.side === 'OURS').map((p) => p.name))];
    const theirs = [...new Set(parties.filter((p) => p.side === 'OPPONENT').map((p) => p.name))];
    const like = (name: string) => ({ contains: name, mode: 'insensitive' as const });
    const liveCase = { firmId: user.firmId, deletedAt: null };
    const otherIntakes = { firmId: user.firmId, ...(excludeIntakeId ? { id: { not: excludeIntakeId } } : {}) };
    const caseRef = { select: { id: true, title: true, ownRef: true, status: true } };
    const none = Promise.resolve([] as never[]);

    const [oppParticipants, oppIntakes, clients, contacts, ourParticipants, casesByClientName, caseClients, ourIntakes] =
      await Promise.all([
        ours.length
          ? this.prisma.caseParticipant.findMany({
              where: { side: ParticipantSide.OPPONENT, case: liveCase, OR: ours.map((n) => ({ name: like(n) })) },
              select: { name: true, role: true, side: true, case: caseRef },
            })
          : none,
        ours.length
          ? this.prisma.intake.findMany({
              where: { ...otherIntakes, OR: ours.map((n) => ({ opposingParty: like(n) })) },
              select: { id: true, title: true, opposingParty: true },
            })
          : none,
        theirs.length
          ? this.prisma.client.findMany({
              where: { firmId: user.firmId, OR: theirs.map((n) => ({ name: like(n) })) },
              select: { id: true, name: true },
            })
          : none,
        theirs.length
          ? this.prisma.clientContact.findMany({
              where: { client: { firmId: user.firmId }, OR: theirs.map((n) => ({ name: like(n) })) },
              select: { name: true, clientId: true, client: { select: { name: true } } },
            })
          : none,
        theirs.length
          ? this.prisma.caseParticipant.findMany({
              where: { side: ParticipantSide.OURS, case: liveCase, OR: theirs.map((n) => ({ name: like(n) })) },
              select: { name: true, role: true, side: true, case: caseRef },
            })
          : none,
        theirs.length
          ? this.prisma.case.findMany({
              where: { ...liveCase, OR: theirs.map((n) => ({ clientName: like(n) })) },
              select: { id: true, title: true, ownRef: true, status: true, clientName: true },
            })
          : none,
        theirs.length
          ? this.prisma.caseClient.findMany({
              where: { case: liveCase, client: { OR: theirs.map((n) => ({ name: like(n) })) } },
              select: { client: { select: { id: true, name: true } }, case: caseRef },
            })
          : none,
        theirs.length
          ? this.prisma.intake.findMany({
              where: { ...otherIntakes, OR: theirs.flatMap((n) => [{ clientName: like(n) }, { contactName: like(n) }]) },
              select: { id: true, title: true, clientName: true, contactName: true },
            })
          : none,
      ]);

    const hits: ConflictMatch[] = [];
    const add = (value: string | null | undefined, names: string[], match: Omit<ConflictMatch, 'term'>) => {
      const v = value ? normalizeName(value) : '';
      for (const term of names) if (v && matchesTerm(v, term)) hits.push({ ...match, term });
    };
    const onCase = (c: { id: string; title: string; ownRef: string; status: string }) => ({
      caseId: c.id, caseTitle: c.title, ownRef: c.ownRef, caseStatus: c.status,
    });

    for (const p of oppParticipants) add(p.name, ours, { kind: 'CASE_PARTY', name: p.name, side: p.side, role: p.role, ...onCase(p.case) });
    for (const i of oppIntakes) add(i.opposingParty, ours, { kind: 'INTAKE_PARTY', name: i.opposingParty ?? '', side: 'OPPONENT', intakeId: i.id, intakeTitle: i.title ?? undefined });
    for (const c of clients) add(c.name, theirs, { kind: 'CLIENT', name: c.name, side: 'OURS', clientId: c.id });
    for (const c of contacts) add(c.name, theirs, { kind: 'CLIENT_CONTACT', name: c.name, side: 'OURS', clientId: c.clientId, role: c.client?.name });
    for (const p of ourParticipants) add(p.name, theirs, { kind: 'CASE_PARTY', name: p.name, side: p.side, role: p.role, ...onCase(p.case) });
    for (const k of casesByClientName) add(k.clientName, theirs, { kind: 'CASE_CLIENT_NAME', name: k.clientName ?? '', side: 'OURS', ...onCase(k) });
    for (const k of caseClients) add(k.client.name, theirs, { kind: 'CASE_CLIENT', name: k.client.name, side: 'OURS', clientId: k.client.id, ...onCase(k.case) });
    for (const i of ourIntakes) {
      for (const name of [i.clientName, i.contactName]) {
        add(name, theirs, { kind: 'INTAKE_PARTY', name: name ?? '', side: 'OURS', intakeId: i.id, intakeTitle: i.title ?? undefined });
      }
    }
    return hits;
  }

  /** เก็บผลของ gate ไว้กับคดี/เรื่องรับที่เพิ่งเปิด; ข้ามผลตรวจ = มี AuditLog. `automatic` = ระบบข้ามให้เอง (พอร์ทัล) */
  async recordForCase(
    user: AuthUser,
    gate: ConflictGate,
    link: { caseId?: string; intakeId?: string; automatic?: boolean },
    db: Prisma.TransactionClient = this.prisma,
  ) {
    const check = await db.conflictCheck.create({
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
      await db.auditLog.create({
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
            automatic: !!link.automatic,
          },
        },
      });
    }
    if (link.intakeId) await this.advanceIntakeToConflictCheck(user, link.intakeId, db);
  }

  /** Spec L6: recording a check on an intake moves it to CONFLICT_CHECK, never backwards. */
  private async advanceIntakeToConflictCheck(user: AuthUser, intakeId: string, db: Prisma.TransactionClient = this.prisma) {
    const intake = await db.intake.findFirst({
      where: { id: intakeId, firmId: user.firmId },
      select: { id: true, stage: true },
    });
    if (!intake) return;
    const index = INTAKE_STAGE_ORDER.indexOf(intake.stage as IntakeStage);
    if (index >= INTAKE_STAGE_ORDER.indexOf(IntakeStage.CONFLICT_CHECK)) return;
    await db.intake.update({
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
