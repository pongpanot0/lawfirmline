export interface OpponentRow {
  name: string;
  /** '' = let the API choose the role opposite ours. */
  role: string;
  personType: string;
}

export function bangkokDayToIso(day: string): string {
  return new Date(`${day}T00:00:00+07:00`).toISOString();
}

/** The litigation part of POST /cases, without empty values. */
export function litigationPayload(input: {
  partyRole: string;
  opponents: OpponentRow[];
  courtLevel: string;
  courtName: string;
  blackCaseNumber: string;
  limitationDeadline: string;
}) {
  const opponents = input.opponents
    .map((row) => ({
      name: row.name.trim(),
      ...(row.role ? { role: row.role } : {}),
      ...(row.personType ? { personType: row.personType } : {}),
    }))
    .filter((row) => row.name);
  return {
    ...(input.partyRole ? { partyRole: input.partyRole } : {}),
    ...(opponents.length ? { opponents } : {}),
    courtLevel: input.courtLevel,
    ...(input.courtName.trim() ? { courtName: input.courtName.trim() } : {}),
    ...(input.blackCaseNumber.trim() ? { blackCaseNumber: input.blackCaseNumber.trim() } : {}),
    ...(input.limitationDeadline ? { limitationDeadline: bangkokDayToIso(input.limitationDeadline) } : {}),
  };
}
