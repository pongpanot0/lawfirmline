// Same split the server uses (pleading-citations.ts) so paragraph indexes line up
// with `unsupportedParagraphs`.
export function splitDraftParagraphs(bodyText: string): string[] {
  return bodyText.split(/\n\s*\n/);
}

export type DraftSegment = { type: 'text'; value: string } | { type: 'citation'; n: number };

/** Splits a paragraph into plain-text runs and `[N]` citation markers. */
export function splitParagraphSegments(paragraph: string): DraftSegment[] {
  const segments: DraftSegment[] = [];
  let lastIndex = 0;
  for (const match of paragraph.matchAll(/\[(\d+)\]/g)) {
    const index = match.index ?? 0;
    if (index > lastIndex) segments.push({ type: 'text', value: paragraph.slice(lastIndex, index) });
    segments.push({ type: 'citation', n: Number(match[1]) });
    lastIndex = index + match[0].length;
  }
  if (lastIndex < paragraph.length) segments.push({ type: 'text', value: paragraph.slice(lastIndex) });
  return segments;
}
