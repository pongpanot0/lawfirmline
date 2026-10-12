import { ParticipantRole, ParticipantSide, opponentParticipantRole, ourParticipantRole } from '@lawfirm/shared';
import { Prisma } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.module';

export type PartyDb = Pick<PrismaService | Prisma.TransactionClient, 'case' | 'caseParticipant'>;

export interface OpponentInput {
  name: string;
  role?: ParticipantRole;
  personType?: string;
}

/**
 * CaseParticipant is the only place parties live. Our own client is one of
 * them, on side OURS, with the role matching Case.partyRole — kept in step here
 * so conflict checks and pleadings read one list.
 */
export async function ensureOurClientParticipant(db: PartyDb, caseId: string): Promise<void> {
  const legalCase = await db.case.findUnique({
    where: { id: caseId },
    select: { partyRole: true, clientId: true, clientName: true, client: { select: { name: true } } },
  });
  if (!legalCase?.partyRole || !legalCase.clientId) return;
  const role = ourParticipantRole(legalCase.partyRole);
  const existing = await db.caseParticipant.findFirst({
    where: { caseId, clientId: legalCase.clientId },
    select: { id: true, role: true, side: true },
  });
  if (existing) {
    if (existing.role !== role || existing.side !== ParticipantSide.OURS) {
      await db.caseParticipant.update({ where: { id: existing.id }, data: { role, side: ParticipantSide.OURS } });
    }
    return;
  }
  await db.caseParticipant.create({
    data: {
      caseId,
      clientId: legalCase.clientId,
      name: legalCase.client?.name ?? legalCase.clientName ?? '',
      role,
      side: ParticipantSide.OURS,
    },
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
