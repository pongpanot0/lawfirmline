import * as Db from '../generated/prisma';
import {
  CourtEventKind,
  DeadlineDayBasis,
  DeadlineTrigger,
  JudgmentOutcome,
  ParticipantRole,
  PartyRole,
  ServiceMethod,
  opponentParticipantRole,
  ourParticipantRole,
} from '@lawfirm/shared';

/** The shared enums are what DTOs validate against; the DB enums are what Prisma writes. They must not drift. */
describe('litigation enums match the database', () => {
  it.each([
    ['CourtEventKind', CourtEventKind],
    ['ServiceMethod', ServiceMethod],
    ['JudgmentOutcome', JudgmentOutcome],
    ['PartyRole', PartyRole],
    ['DeadlineTrigger', DeadlineTrigger],
    ['DeadlineDayBasis', DeadlineDayBasis],
  ])('%s', (name, shared) => {
    const db = (Db as unknown as Record<string, Record<string, string>>)[name];
    expect(Object.values(db).sort()).toEqual(Object.values(shared).sort());
  });
});

describe('party role mapping', () => {
  it('puts our client on our role and the opponent on the opposite one', () => {
    expect(ourParticipantRole(PartyRole.PLAINTIFF)).toBe(ParticipantRole.PLAINTIFF);
    expect(ourParticipantRole(PartyRole.RESPONDENT)).toBe(ParticipantRole.RESPONDENT);
    expect(opponentParticipantRole(PartyRole.PLAINTIFF)).toBe(ParticipantRole.DEFENDANT);
    expect(opponentParticipantRole(PartyRole.DEFENDANT)).toBe(ParticipantRole.PLAINTIFF);
    expect(opponentParticipantRole(PartyRole.PETITIONER)).toBe(ParticipantRole.RESPONDENT);
    expect(opponentParticipantRole(PartyRole.RESPONDENT)).toBe(ParticipantRole.PETITIONER);
    expect(opponentParticipantRole(null)).toBe(ParticipantRole.OTHER);
  });
});
