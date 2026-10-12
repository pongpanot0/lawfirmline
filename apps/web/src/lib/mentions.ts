/** The `@query` being typed at the cursor, or null. Names may be Thai; a space ends the query. */
export function getMentionContext(text: string, cursorPos: number): { startIdx: number; query: string } | null {
  const beforeCursor = text.substring(0, cursorPos);
  const lastAt = beforeCursor.lastIndexOf('@');
  if (lastAt === -1) return null;
  const afterLastAt = beforeCursor.substring(lastAt + 1);
  if (!/^[^\s@]*$/.test(afterLastAt)) return null;
  return { startIdx: lastAt + 1, query: afterLastAt.toLowerCase() };
}

/** Picked people whose "@FirstName" is still in the body (a deleted mention does not notify). */
export function mentionedIdsIn(body: string, picked: { id: string; firstName: string; lastName: string }[]): string[] {
  return [...new Set(picked.filter((p) => body.includes(`@${p.firstName}`)).map((p) => p.id))];
}
