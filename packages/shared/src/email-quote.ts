/**
 * Splits an email into the new part and the quoted history below it, the way
 * Outlook hides "From: … Sent: …" under "แสดงข้อความก่อนหน้า".
 * ponytail: marker heuristics for Outlook / Gmail / Apple Mail; an unknown client just shows in full.
 */

// Outlook / Gmail / Apple Mail reply separators, English and Thai Outlook.
const TEXT_MARKERS = [
  /^-{2,}\s*(Original Message|ข้อความต้นฉบับ)\s*-{2,}\s*$/im,
  /^_{10,}\s*$/m,
  /^(From|จาก):\s.+\n(.+\n){0,3}?(Sent|Date|ส่ง|วันที่):\s/im,
  /^On .+wrote:\s*$/im,
];

const HTML_MARKERS = [
  /<div[^>]*\bid=["']?(appendonsend|divRplyFwdMsg)\b/i,
  /<div[^>]*border-top:\s*solid\s+#e1e1e1/i,
  /<hr[^>]*display:\s*inline-block/i,
  /<div[^>]*\bclass=["']?gmail_quote\b/i,
  /<blockquote[^>]*type=["']?cite\b/i,
];

export interface SplitEmail {
  main: string;
  quoted: string | null;
}

function splitAt(body: string, markers: RegExp[]): SplitEmail {
  let cut = -1;
  for (const marker of markers) {
    const match = marker.exec(body);
    if (match && (cut === -1 || match.index < cut)) cut = match.index;
  }
  // A reply with nothing above the quote (a bare forward) keeps everything visible.
  if (cut <= 0 || !body.slice(0, cut).replace(/<[^>]*>|&nbsp;/g, '').trim()) return { main: body, quoted: null };
  return { main: body.slice(0, cut), quoted: body.slice(cut) };
}

/** Plain text: also squeezes the runs of blank lines Graph's HTML→text leaves behind. */
export function splitQuotedText(text: string): SplitEmail {
  const { main, quoted } = splitAt(text.replace(/\r\n/g, '\n'), TEXT_MARKERS);
  const squeeze = (s: string) => s.replace(/\n{3,}/g, '\n\n').trim();
  return { main: squeeze(main), quoted: quoted && squeeze(quoted) };
}

export function splitQuotedHtml(html: string): SplitEmail {
  return splitAt(html, HTML_MARKERS);
}

/** One-line preview for a collapsed message row. */
export function emailPreview(bodyText: string | null): string {
  return splitQuotedText(bodyText ?? '').main.replace(/\s+/g, ' ').slice(0, 140);
}

export function senderInitials(name: string | null, address: string | null): string {
  const source = (name ?? address ?? '?').trim();
  const words = source.split(/[\s@.,]+/).filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[1][0] : source.slice(0, 2);
  return letters.toUpperCase();
}
