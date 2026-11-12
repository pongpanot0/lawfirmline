import { AuthUser, hasFirmCapability } from '@lawfirm/shared';
import { LeaveStatus, Prisma } from '../generated/prisma';

type Viewer = Pick<AuthUser, 'id' | 'firmId' | 'firmRole'>;

/**
 * Who sees whose leave — the one rule behind GET /leaves and the AI tools.
 * Approvers see every request in full. Anyone else sees their own in full and,
 * of everyone else's, only approved leave: who is out and when.
 */
export function leaveVisibleWhere(user: Viewer): Prisma.LeaveRequestWhereInput {
  return hasFirmCapability(user.firmRole, 'approveLeave')
    ? { firmId: user.firmId }
    : { firmId: user.firmId, OR: [{ userId: user.id }, { status: LeaveStatus.APPROVED }] };
}

/** Type, decision and court conflicts are for the person on leave and the approvers only. */
export function canSeeLeaveDetail(user: Viewer, leaveUserId: string): boolean {
  return leaveUserId === user.id || hasFirmCapability(user.firmRole, 'approveLeave');
}
