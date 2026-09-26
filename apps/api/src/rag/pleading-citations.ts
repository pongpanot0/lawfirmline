export interface PleadingSource {
  documentId: string;
  filename: string;
  pageStart: number | null;
  content: string;
}

export interface PleadingCitation {
  n: number;
  documentId: string;
  filename: string;
  pageStart: number | null;
  snippet: string;
}

/**
 * Maps `[N]` markers in a draft to its numbered sources and lists paragraphs
 * that state something (longer than a heading) without any marker.
 */
export function parseCitations(
  body: string,
  sources: PleadingSource[],
): { citations: PleadingCitation[]; unsupportedParagraphs: number[] } {
  const seen = new Set<number>();
  const citations: PleadingCitation[] = [];
  for (const match of body.matchAll(/\[(\d+)\]/g)) {
    const n = Number(match[1]);
    if (n < 1 || n > sources.length || seen.has(n)) continue;
    seen.add(n);
    const s = sources[n - 1];
    citations.push({ n, documentId: s.documentId, filename: s.filename, pageStart: s.pageStart, snippet: s.content.slice(0, 160) });
  }

  const unsupportedParagraphs: number[] = [];
  body.split(/\n\s*\n/).forEach((p, i) => {
    if (!/\[\d+\]/.test(p) && p.trim().length > 40) unsupportedParagraphs.push(i);
  });

  return { citations, unsupportedParagraphs };
}
