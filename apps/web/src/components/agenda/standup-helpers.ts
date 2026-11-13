export function greeting(hour: number) {
  return hour < 12 ? 'อรุณสวัสดิ์' : hour < 17 ? 'สวัสดีตอนบ่าย' : 'สวัสดีตอนเย็น';
}
export function toggleChip(ids: string[], id: string) {
  return ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id];
}
