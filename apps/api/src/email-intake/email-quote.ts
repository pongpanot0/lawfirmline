// ponytail: server copy of the text markers in apps/web/src/lib/email-quote.ts (web also splits HTML, which the API never needs).
// Swap for the @lawfirm/shared splitQuotedText when branches are combined.
const QUOTE_MARKERS = [
  /^-{2,}\s*(Original Message|ข้อความต้นฉบับ)\s*-{2,}\s*$/im,
  /^_{10,}\s*$/m,
  /^(From|จาก):\s.+\n(.+\n){0,3}?(Sent|Date|ส่ง|วันที่):\s/im,
  /^On .+wrote:\s*$/im,
];

/** Splits the message's own words from the quoted history below the first reply/forward marker. */
export function splitQuotedText(text: string): { main: string; quoted: string | null } {
  let cut = text.length;
  for (const marker of QUOTE_MARKERS) {
    const hit = marker.exec(text);
    if (hit && hit.index < cut) cut = hit.index;
  }
  if (cut === text.length) return { main: text.trim(), quoted: null };
  const main = text.slice(0, cut).trim();
  if (!main) return { main: text.trim(), quoted: null };
  return { main, quoted: text.slice(cut).trim() };
}
