export function suggestMember<T extends { userId: string; overdueCount: number; openPoints: number }>(members: T[], today: { userId: string; onLeave: boolean }[]): T | undefined {
  return members.filter((member) => member.overdueCount === 0 && today.some((person) => person.userId === member.userId && !person.onLeave)).sort((a, b) => a.openPoints - b.openPoints)[0];
}

const avatarColors = ['bg-[var(--terra-bg-f7dfd5)] text-[var(--terra-text-733e35)]', 'bg-[var(--terra-bg-d8eee1)] text-[var(--terra-text-245b48)]', 'bg-[var(--terra-bg-eadff5)] text-[var(--terra-text-674782)]', 'bg-[var(--terra-bg-f9ebc8)] text-[var(--terra-text-70510b)]', 'bg-[var(--terra-bg-dcedf7)] text-[var(--terra-text-35577c)]', 'bg-[var(--terra-bg-f7dfea)] text-[var(--terra-text-874860)]'];
export function avatarColor(userId: string): string {
  let hash = 0;
  for (const char of userId) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0;
  return avatarColors[hash % avatarColors.length];
}
export function standupLabel(state: string): string {
  return ({ checked_in: 'เช็กอินแล้ว', not_yet: 'ยังไม่เช็กอิน', skipped: 'ข้ามวันนี้', blocked: 'ติดปัญหา', on_leave: 'ลาวันนี้', not_required: 'ไม่ต้องเช็กอิน' } as Record<string, string>)[state] ?? '';
}
