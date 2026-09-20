/** Recognize legacy non-results without treating them as verified knowledge. */
export function isUnusableAnalysis(summary: string | null | undefined): boolean {
  const text = (summary ?? '').trim();
  return !text || /no (?:documents? (?:were |are )?provided|summary generated)|please provide (?:the |your )?(?:legal )?documents|ไม่มีเอกสาร(?:ให้|สำหรับ).*วิเคราะห์|ไม่สามารถสรุปเหตุการณ์ได้|ตัวอย่างสรุป — ตั้งค่า/i.test(text);
}
