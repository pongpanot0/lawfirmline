export function suggestMember<T extends { userId: string; overdueCount: number; openPoints: number }>(members: T[], today: { userId: string; onLeave: boolean }[]): T | undefined {
  return members.filter((member) => member.overdueCount === 0 && today.some((person) => person.userId === member.userId && !person.onLeave)).sort((a, b) => a.openPoints - b.openPoints)[0];
}
