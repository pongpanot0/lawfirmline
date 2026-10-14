/** Thai relative time, e.g. "5 นาทีที่แล้ว". null/invalid → `never` text. */
export function relativeTimeTh(iso: string | null | undefined, now: Date = new Date(), never = 'ยังไม่เคยซิงก์'): string {
  if (!iso) return never;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return never;
  const min = Math.floor((now.getTime() - t) / 60_000);
  if (min < 1) return 'เมื่อสักครู่';
  if (min < 60) return `${min} นาทีที่แล้ว`;
  if (min < 1440) return `${Math.floor(min / 60)} ชม.ที่แล้ว`;
  return `${Math.floor(min / 1440)} วันที่แล้ว`;
}
