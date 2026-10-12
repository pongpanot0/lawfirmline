/** Opposing counsel / insurer act for a party; that link is what `representedByParticipantId` records. */
export const COUNSEL_ROLES: readonly string[] = ['OPPOSING_LAWYER', 'OPPOSING_INSURER'];

export function participantPayload(form: Record<string, string>): Record<string, string | null> {
  const data: Record<string, string | null> = {};
  for (const [key, value] of Object.entries(form)) data[key] = value === '' ? null : value;
  if (form.side !== 'OURS') data.clientId = null;
  if (!COUNSEL_ROLES.includes(form.role)) data.representedByParticipantId = null;
  return data;
}
