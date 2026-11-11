export function dayOffset(date: string, today: string): number {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
}

export function dayGroup(offset: number | null): 'เกินกำหนด' | 'วันนี้' | 'พรุ่งนี้' | 'ถัดไป' {
  if (offset === null || offset > 1) return 'ถัดไป';
  if (offset < 0) return 'เกินกำหนด';
  return offset === 0 ? 'วันนี้' : 'พรุ่งนี้';
}
