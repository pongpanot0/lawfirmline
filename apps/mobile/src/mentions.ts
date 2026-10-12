/** @mentions in task notes. Mirrors the web's lib/mentions.ts, with the cursor at the end of the text. */
export interface MentionPerson { id: string; firstName: string; lastName: string }

/**
 * The `@query` being typed at the end of the text, or null. A space ends it (Thai names have none).
 * ponytail: reads the end of the text, which is where a phone keyboard types; track the selection if
 * mentions in the middle of a note turn out to matter.
 */
export function mentionQuery(text: string): string | null {
  const match = text.match(/@([^\s@]*)$/);
  return match ? match[1].toLowerCase() : null;
}

/** Replace the trailing `@query` with `@FirstName ` — the space closes the list. */
export function insertMention(text: string, firstName: string): string {
  return text.replace(/@[^\s@]*$/, () => `@${firstName} `);
}

/** Up to `limit` people whose name contains the query. */
export function matchPeople<T extends MentionPerson>(people: T[], query: string, limit = 5): T[] {
  return people.filter((person) => `${person.firstName} ${person.lastName}`.toLowerCase().includes(query)).slice(0, limit);
}

/** Picked people whose "@FirstName" is still in the text: deleting the mention un-notifies them. */
export function mentionedIdsIn(body: string, picked: MentionPerson[]): string[] {
  return [...new Set(picked.filter((person) => body.includes(`@${person.firstName}`)).map((person) => person.id))];
}

/** Ids the API dropped (they cannot open the task): the saved comment keeps only the people it notified. */
export function droppedMentions(requested: string[], saved: string[] | null | undefined): string[] {
  const kept = new Set(saved ?? []);
  return requested.filter((id) => !kept.has(id));
}

/** D9: the case team when the task has a case, else firm members; never the author, never twice. */
export function mentionCandidates(
  legalCase: { leadLawyer?: MentionPerson | null; assignments?: Array<{ user: MentionPerson }> } | null | undefined,
  members: MentionPerson[] | undefined,
  authorId: string | undefined,
  extra: Array<MentionPerson | null | undefined> = [],
): MentionPerson[] {
  const pool = legalCase
    ? [legalCase.leadLawyer, ...(legalCase.assignments ?? []).map((item) => item.user), ...extra]
    : [...(members ?? []), ...extra];
  const seen = new Set<string>();
  return pool.filter((person): person is MentionPerson => {
    if (!person || person.id === authorId || seen.has(person.id)) return false;
    seen.add(person.id);
    return true;
  });
}
