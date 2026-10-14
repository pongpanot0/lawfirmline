/** ป้าย "รอตอบ" ของอีเมลลูกความ: < 48 ชม. แสดงเป็นชั่วโมง, ตั้งแต่นั้นเป็นวัน */
export function awaitingReplyLabel(since: string, now: number = Date.now()): string {
  const hours = Math.max(1, Math.floor((now - new Date(since).getTime()) / 3_600_000));
  return hours < 48 ? `รอตอบ ${hours} ชม.` : `รอตอบ ${Math.floor(hours / 24)} วัน`;
}
