import { GraphAttachment } from '../outlook-graph.client';

/** Inline images larger than this stay unresolved (a body is one DB text column). */
const MAX_INLINE_BYTES = 2 * 1024 * 1024;
const CID_REF = /cid:([^"'\s<>)]+)/gi;
const IMAGE_MIME = /^image\/[\w.+-]+$/i;

const normalizeCid = (cid: string) => {
  let id = cid.trim();
  try {
    id = decodeURIComponent(id);
  } catch {
    // keep as-is
  }
  return id.replace(/^<|>$/g, '').toLowerCase();
};

export const hasCidRefs = (html: string | null | undefined): html is string => !!html && /cid:/i.test(html);

/**
 * Outlook embeds signature logos and pasted pictures as `<img src="cid:...">` pointing at the
 * message's inline attachments. The web viewer's CSP only allows `data:` images, so swap each
 * reference for a data URI of the matching attachment. References with no usable attachment
 * (missing, not an image, too large) become an empty `data:,` so they don't hit the network.
 */
export function inlineCidImages(html: string, attachments: GraphAttachment[]): string {
  const byCid = new Map<string, string>();
  for (const a of attachments) {
    if (!a.contentId || !a.contentBytes || !IMAGE_MIME.test(a.contentType) || a.size > MAX_INLINE_BYTES) continue;
    byCid.set(normalizeCid(a.contentId), `data:${a.contentType.toLowerCase()};base64,${a.contentBytes}`);
  }
  return html.replace(CID_REF, (_, cid: string) => byCid.get(normalizeCid(cid)) ?? 'data:,');
}
