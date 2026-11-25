import { AuthUser, hasFirmCapability } from '@lawfirm/shared';
import { LeaveStatus, LeaveType, Prisma } from '../generated/prisma';

type Viewer = Pick<AuthUser, 'id' | 'firmId' | 'firmRole'>;

export const LEAVE_TYPE_LABEL: Record<LeaveType, string> = {
  SICK: 'ลาป่วย',
  PERSONAL: 'ลากิจ',
  VACATION: 'พักร้อน',
};

/**
 * Leave the whole firm is told about: approved leave, and sick or personal leave
 * from the moment it is filed (shown as รออนุมัติ — people need to know who is out
 * today). Vacation is planned ahead, so it only shows once approved.
 */
export const ANNOUNCED_LEAVE: Prisma.LeaveRequestWhereInput = {
  OR: [{ status: LeaveStatus.APPROVED }, { status: LeaveStatus.PENDING, type: { in: [LeaveType.SICK, LeaveType.PERSONAL] } }],
};

export function isAnnounced(leave: { status: LeaveStatus; type: LeaveType }): boolean {
  return leave.status === LeaveStatus.APPROVED
    || (leave.status === LeaveStatus.PENDING && (leave.type === LeaveType.SICK || leave.type === LeaveType.PERSONAL));
}

/** " (รออนุมัติ)" after a name whose announced leave is still pending. */
export function pendingMark(leave: { status: LeaveStatus }): string {
  return leave.status === LeaveStatus.PENDING ? ' (รออนุมัติ)' : '';
}

/**
 * Who sees whose leave — the one rule behind GET /leaves and the AI tools.
 * Approvers see every request in full. Anyone else sees their own in full and,
 * of everyone else's, only announced leave (ANNOUNCED_LEAVE): who is out and when.
 */
export function leaveVisibleWhere(user: Viewer): Prisma.LeaveRequestWhereInput {
  return hasFirmCapability(user.firmRole, 'approveLeave')
    ? { firmId: user.firmId }
    : { firmId: user.firmId, OR: [{ userId: user.id }, ANNOUNCED_LEAVE] };
}

/** Type, decision and court conflicts are for the person on leave and the approvers only. */
export function canSeeLeaveDetail(user: Viewer, leaveUserId: string): boolean {
  return leaveUserId === user.id || hasFirmCapability(user.firmRole, 'approveLeave');
}
