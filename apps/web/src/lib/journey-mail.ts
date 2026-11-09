export function mailDateGroup(date: Date, now = new Date()): string {
  const day = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const days = (day(now) - day(date)) / 86400000;
  return days <= 0 ? 'วันนี้' : days === 1 ? 'เมื่อวาน' : days < 7 ? 'สัปดาห์นี้' : 'เก่ากว่า';
}
