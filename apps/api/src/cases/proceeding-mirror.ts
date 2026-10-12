import { COURT_LEVEL_LABELS, CourtLevel } from '@lawfirm/shared';
import { Prisma } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.module';

export type ProceedingDb = Pick<PrismaService | Prisma.TransactionClient, 'case' | 'caseProceeding'>;

export const COURT_LEVEL_ORDER: CourtLevel[] = [CourtLevel.TRIAL, CourtLevel.APPEAL, CourtLevel.SUPREME];

const key = (caseId: string, courtLevel: CourtLevel) => ({ caseId_courtLevel: { caseId, courtLevel } });
const blankToNull = (value: string | null | undefined) =>
  value === undefined ? undefined : value?.trim() ? value.trim() : null;

/** A trial proceeding starts with the case's court; a higher one with the court level's name. */
async function initialCourtName(db: ProceedingDb, caseId: string, courtLevel: CourtLevel) {
  if (courtLevel !== CourtLevel.TRIAL) return COURT_LEVEL_LABELS[courtLevel];
  const legalCase = await db.case.findUnique({ where: { id: caseId }, select: { courtName: true } });
  return legalCase?.courtName ?? null;
}

/** The case's proceeding at `courtLevel`, created when missing. */
export async function ensureProceeding(db: ProceedingDb, caseId: string, courtLevel: CourtLevel) {
  return db.caseProceeding.upsert({
    where: key(caseId, courtLevel),
    create: { caseId, courtLevel, courtName: await initialCourtName(db, caseId, courtLevel) },
    update: {},
  });
}

/**
 * Case.courtName / blackCaseNumber / redCaseNumber mirror the proceeding at
 * Case.courtLevel (TRIAL when unset), so templates, print forms and lists that
 * read the case keep working.
 */
export async function mirrorProceeding(db: ProceedingDb, caseId: string): Promise<void> {
  const legalCase = await db.case.findUnique({ where: { id: caseId }, select: { courtLevel: true } });
  const level = (legalCase?.courtLevel as CourtLevel | null) ?? CourtLevel.TRIAL;
  const current = await db.caseProceeding.findUnique({ where: key(caseId, level) });
  if (!current) return;
  await db.case.update({
    where: { id: caseId },
    data: {
      courtName: current.courtName,
      blackCaseNumber: current.blackCaseNumber,
      redCaseNumber: current.redCaseNumber,
    },
  });
}

/** Numbers edited on the case itself belong to the proceeding at that level. */
export async function saveCaseNumbers(
  db: ProceedingDb,
  caseId: string,
  courtLevel: CourtLevel,
  fields: { courtName?: string | null; blackCaseNumber?: string | null; redCaseNumber?: string | null },
): Promise<void> {
  const update = Object.fromEntries(
    Object.entries({
      courtName: blankToNull(fields.courtName),
      blackCaseNumber: blankToNull(fields.blackCaseNumber),
      redCaseNumber: blankToNull(fields.redCaseNumber),
    }).filter(([, value]) => value !== undefined),
  );
  await db.caseProceeding.upsert({
    where: key(caseId, courtLevel),
    create: { caseId, courtLevel, courtName: await initialCourtName(db, caseId, courtLevel), ...update },
    update,
  });
}

export function sortProceedings<T extends { courtLevel: string }>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) => COURT_LEVEL_ORDER.indexOf(a.courtLevel as CourtLevel) - COURT_LEVEL_ORDER.indexOf(b.courtLevel as CourtLevel),
  );
}
