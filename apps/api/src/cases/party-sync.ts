import { ParticipantRole, ParticipantSide, opponentParticipantRole, ourParticipantRole } from '@lawfirm/shared';
import { Prisma } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.module';

export type PartyDb = Pick<PrismaService | Prisma.TransactionClient, 'case' | 'caseParticipant'>;

export interface OpponentInput {
  name: string;
  role?: ParticipantRole;
  personType?: string;
}

export interface PreviousParty {
  clientId: string | null;
  partyRole: string | null;
}

/** The role the sync itself gives our client — anything else on that row was set by a person. */
const autoRole = (partyRole: string | null) => (partyRole ? ourParticipantRole(partyRole) : ParticipantRole.OTHER);

/**
 * CaseParticipant is the only place parties live. Our own client is one of
 * them, on side OURS, with the role matching Case.partyRole — kept in step here
 * so conflict checks and pleadings read one list.
 *
 * `previous` (on an edit) is the case's client and side before the change. Then
 * only a row still holding the value the sync gave it is moved; a role or side
 * someone chose by hand (JOINT_PLAINTIFF, a client-linked WITNESS) is left alone.
 */
export async function ensureOurClientParticipant(db: PartyDb, caseId: string, previous?: PreviousParty): Promise<void> {
  const legalCase = await db.case.findUnique({
    where: { id: caseId },
    select: { partyRole: true, clientId: true, clientName: true, client: { select: { name: true } } },
  });
  if (!legalCase?.clientId) return;
  const isAuto = (row: { role: string; side: string }) =>
    row.side === ParticipantSide.OURS && row.role === autoRole(previous?.partyRole ?? null);

  if (!legalCase.partyRole) {
    // Side cleared: the auto row no longer knows its role.
    if (!previous?.partyRole) return;
    const row = await db.caseParticipant.findFirst({
      where: { caseId, clientId: legalCase.clientId },
      select: { id: true, role: true, side: true },
    });
    if (row && isAuto(row)) {
      await db.caseParticipant.update({ where: { id: row.id }, data: { role: ParticipantRole.OTHER } });
    }
    return;
  }

  const role = ourParticipantRole(legalCase.partyRole);
  const name = legalCase.client?.name ?? legalCase.clientName ?? '';
  const existing = await db.caseParticipant.findFirst({
    where: { caseId, clientId: legalCase.clientId },
    select: { id: true, role: true, side: true },
  });
  if (existing) {
    const stale = existing.role !== role || existing.side !== ParticipantSide.OURS;
    if (stale && (!previous || isAuto(existing))) {
      await db.caseParticipant.update({ where: { id: existing.id }, data: { role, side: ParticipantSide.OURS } });
    }
    return;
  }

  // Client changed A → B: move A's untouched row over, keeping its id so counsel links stay valid.
  if (previous?.clientId && previous.clientId !== legalCase.clientId) {
    const oldRow = await db.caseParticipant.findFirst({
      where: { caseId, clientId: previous.clientId, side: ParticipantSide.OURS, role: autoRole(previous.partyRole) },
      select: { id: true },
    });
    if (oldRow) {
      await db.caseParticipant.update({
        where: { id: oldRow.id },
        data: { clientId: legalCase.clientId, name, role, side: ParticipantSide.OURS },
      });
      return;
    }
  }

  await db.caseParticipant.create({
    data: { caseId, clientId: legalCase.clientId, name, role, side: ParticipantSide.OURS },
  });
}

/** @returns how many opponent rows were added. */
export async function addOpponents(
  db: PartyDb,
  caseId: string,
  partyRole: string | null | undefined,
  opponents: OpponentInput[],
): Promise<number> {
  const existing = await db.caseParticipant.findMany({
    where: { caseId, side: ParticipantSide.OPPONENT },
    select: { name: true },
  });
  const seen = new Set(existing.map((p) => p.name.trim().toLowerCase()));
  const data = [];
  for (const opponent of opponents) {
    const name = opponent.name.trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    data.push({
      caseId,
      name,
      role: opponent.role ?? opponentParticipantRole(partyRole),
      side: ParticipantSide.OPPONENT,
      personType: opponent.personType?.trim() || null,
    });
  }
  if (data.length === 0) return 0;
  const result = await db.caseParticipant.createMany({ data });
  return result.count;
}
