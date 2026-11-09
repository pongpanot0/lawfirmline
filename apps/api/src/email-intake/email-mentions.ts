import { splitQuotedHtml } from '@lawfirm/shared';
import { htmlToText } from '../outlook-integration/mail/html-to-text';
import { parseFlexibleDate } from '../notifications/line-conversation/flows/date-parse.util';

export interface EmailMention {
  /** Lower-cased address from the mention's mailto: link. */
  email: string;
  name: string;
  /** What was asked of this person: the text after each of their @mentions, up to the end of that line. */
  text: string;
  /** YYYY-MM-DD when the text names a date ("๒๑ ก.ย. ๒๕๖๙", "21/9/2569"); null otherwise. */
  dueDate: string | null;
}

// Outlook writes an @mention as <a href="mailto:x@firm.com" …>@Display Name</a> (sometimes with spans inside).
const MAILTO_ANCHOR = /<a\b[^>]*\bhref=["']mailto:([^"'?]+)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
const SENTINEL = /(\d+)/g;
const THAI_DIGIT = /[๐-๙]/g;
const DATE_CANDIDATE = /\d{1,2}\s*[ก-ฮ][ก-ฮ.]*\s*\d{2,4}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?/g;

export function findDueDate(text: string, now: Date = new Date()): string | null {
  const arabic = text.replace(THAI_DIGIT, (d) => String(d.charCodeAt(0) - 0x0e50));
  for (const [candidate] of arabic.matchAll(DATE_CANDIDATE)) {
    const iso = parseFlexibleDate(candidate.replace(/\s+/g, ' '), now);
    if (iso) return iso;
  }
  return null;
}

/**
 * Who was @mentioned in the new part of an email (quoted history is ignored, so a reply chain does not
 * repeat old asks) and what each person was asked to do. Plain mailto links without a leading "@" are not mentions.
 */
export function parseEmailMentions(html: string | null, now: Date = new Date()): EmailMention[] {
  if (!html) return [];
  const anchors: { email: string; name: string }[] = [];
  const marked = splitQuotedHtml(html).main.replace(MAILTO_ANCHOR, (whole, address: string, inner: string) => {
    const label = htmlToText(inner).trim();
    if (!label.startsWith('@')) return whole;
    anchors.push({ email: decodeURIComponent(address).trim().toLowerCase(), name: label.slice(1).trim() });
    return `${anchors.length - 1}`;
  });
  if (!anchors.length) return [];

  const text = htmlToText(marked);
  const hits = [...text.matchAll(SENTINEL)];
  const gaps = hits.map((hit, i) => text.slice(hit.index + hit[0].length, hits[i + 1]?.index ?? text.length));
  const segments = gaps.map(firstLine);
  // "@A @B please file X" — A's gap is only spaces, so A is asked to do what B is asked.
  for (let i = hits.length - 2; i >= 0; i--) {
    if (!segments[i] && !gaps[i].includes('\n')) segments[i] = segments[i + 1];
  }

  const byEmail = new Map<string, EmailMention>();
  hits.forEach((hit, i) => {
    const anchor = anchors[Number(hit[1])];
    const segment = segments[i];
    if (!segment) return;
    const existing = byEmail.get(anchor.email);
    if (existing) existing.text = `${existing.text}\n${segment}`;
    else byEmail.set(anchor.email, { email: anchor.email, name: anchor.name || anchor.email, text: segment, dueDate: null });
  });
  return [...byEmail.values()].map((m) => ({ ...m, dueDate: findDueDate(m.text, now) }));
}

function firstLine(segment: string): string {
  return (segment.replace(/^[\s,:;-]+/, '').split('\n')[0] ?? '').replace(/\s+/g, ' ').trim();
}
