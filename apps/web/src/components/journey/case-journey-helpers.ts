export function remainingCount(steps: { state: string }[], tasks: { status: string; skippedReason: string | null }[]) {
  return steps.filter((step) => step.state !== 'done').length + tasks.filter((task) => task.status !== 'DONE' && !task.skippedReason).length;
}

export function stepLabel(step: { state: string; skippedAtOpen?: boolean }) {
  return step.skippedAtOpen ? 'ข้ามตอนเปิดคดี' : step.state === 'done' ? 'เสร็จแล้ว' : step.state === 'current' ? 'กำลังทำ' : 'ยังไม่ถึง';
}

export function canChangeOwner(capable: boolean, userId: string | undefined, leadId: string, receiverId?: string | null) {
  return capable || (!!userId && userId === leadId && userId === receiverId);
}
