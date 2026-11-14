import { AuthUser, FirmRole, canDelegateTask } from '@lawfirm/shared';

/** Omit targetRole for the permission check before loading a member; null means not found. */
export function todoAssignmentProblem(user: AuthUser, assigneeId: string, targetRole?: FirmRole | null): { kind: 'forbidden' | 'notFound'; message: string } | null {
  if (assigneeId === user.id) return null;
  if (![FirmRole.OWNER, FirmRole.SENIOR_LAWYER, FirmRole.OFFICE_MANAGER, FirmRole.LAWYER].includes(user.firmRole)) {
    return { kind: 'forbidden', message: 'ผู้ช่วยมอบหมายงานให้ผู้อื่นไม่ได้' };
  }
  if (targetRole === undefined) return null;
  if (targetRole === null || targetRole === FirmRole.EXTERNAL) return { kind: 'notFound', message: 'ผู้รับมอบหมายไม่ได้อยู่ในสำนักงานนี้' };
  if (!canDelegateTask(user.firmRole, targetRole)) {
    return { kind: 'forbidden', message: user.firmRole === FirmRole.LAWYER
      ? 'ทนายความมอบหมายงานได้เฉพาะผู้ช่วยหรือผู้จัดการสำนักงาน'
      : 'มอบหมายได้เฉพาะสมาชิกที่มีบทบาทต่ำกว่าของคุณเท่านั้น' };
  }
  return null;
}
