// Text after a "thanks" line that is still message, not signature: amounts, P.S., long sentences.
const isContent = (line: string) => /บาท|ป\.ล\.|p\.s\./i.test(line) || line.trim().length > 80;

/** Remove sign-offs and corroborated trailing contact blocks without removing the opening line. */
export function stripEmailSignature(text: string): string {
  const lines = text.split(/\r?\n/);
  let end = lines.length;
  while (end > 0 && !lines[end - 1].trim()) end--;
  const cutAt = (index: number) => lines.slice(0, index).join('\n').trimEnd() || text;
  for (let i = 1; i < end; i++) {
    const line = lines[i].trim();
    if (/^(?:ขอแสดงความนับถือ|ด้วยความเคารพ|best regards|kind regards|regards|sincerely)[\s,!]*$/i.test(line)
      || /^sent from my\s+/i.test(line)
      || (i >= end - 8 && /^(?:ขอบคุณ(?:ค่ะ|ครับ)|thanks|thank you)[\s,!]*$/i.test(line) && !lines.slice(i + 1, end).some(isContent))) return cutAt(i);
  }

  const name = /^(?:[A-Z][a-z]+(?:[-'][A-Za-z]+)?(?:\s+[A-Z][a-z]+(?:[-'][A-Za-z]+)?){1,4}|(?:นาย|นาง(?:สาว)?|นพ\.|พญ\.|ดร\.)\s*[^\d@]{2,60})$/;
  const organization = /manager|director|officer|department|company|hospital|limited|บริษัท|โรงพยาบาล|ผู้จัดการ|แผนก|ฝ่าย|ตำแหน่ง/i;
  const contact = /(?:\b0[\d\s()-]{7,}|\+\d[\d\s()-]{7,}|[\w.+-]+@[\w.-]+\.\w+|https?:\/\/|www\.)/i;
  for (let i = Math.max(1, end - 8); i < end - 1; i++) {
    const block = lines.slice(i, end).map((line) => line.trim()).filter(Boolean);
    if (name.test(block[0]) && block.length >= 2 && block.every((line) => line.length <= 100)
      && block.slice(1).every((line) => name.test(line) || organization.test(line) || contact.test(line))
      && block.slice(1).some((line) => organization.test(line) || contact.test(line))) return cutAt(i);
  }
  return text;
}

// Signature containers Outlook (web/desktop/mobile) and Gmail put around the sender's signature.
const HTML_SIGNATURE_START = /<(?:div|table|p)\b[^>]*\b(?:id\s*=\s*["']?(?:Signature|ms-outlook-mobile-signature|signature)\b|class\s*=\s*["'][^"']*\bgmail_signature\b)[^>]*>/i;

/** Cut an HTML body at its marked signature block; bodies without a marker come back unchanged. */
export function stripHtmlSignature(html: string): string {
  const match = HTML_SIGNATURE_START.exec(html);
  if (!match || match.index === 0) return html;
  const head = html.slice(0, match.index);
  return head.replace(/<[^>]+>/g, '').trim() ? head : html;
}
