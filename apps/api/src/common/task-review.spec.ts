import { assignmentCandidates } from '@lawfirm/shared';
import {
  DEFAULT_PLAYBOOKS,
  FirmRole,
  TASK_HANDOFF_NOTE_MIN,
  awaitsReviewBy,
  canActOnReview,
  canDelegateTask,
  effectiveReviewerId,
  isEligibleReviewer,
  partySide,
  taskStageChip,
  visibleTaskLabels,
} from '@lawfirm/shared';

describe('task review helpers', () => {
  it('the reviewer is reviewerId, else the case lead', () => {
    expect(effectiveReviewerId({ reviewerId: 'r1', case: { leadLawyerId: 'lead' } })).toBe('r1');
    expect(effectiveReviewerId({ reviewerId: null, case: { leadLawyerId: 'lead' } })).toBe('lead');
    expect(effectiveReviewerId({ reviewerId: null }, 'lead-from-page')).toBe('lead-from-page');
    expect(effectiveReviewerId({ reviewerId: null, case: null })).toBeNull();
  });

  it('awaits review only while PENDING_REVIEW and only for the reviewer', () => {
    const task = { status: 'PENDING_REVIEW', reviewerId: null, case: { leadLawyerId: 'lead' } };
    expect(awaitsReviewBy(task, 'lead')).toBe(true);
    expect(awaitsReviewBy(task, 'worker')).toBe(false);
    expect(awaitsReviewBy({ ...task, status: 'IN_PROGRESS' }, 'lead')).toBe(false);
  });

  it('eligible reviewers: owner, senior, case lead — never office manager, never the assignee', () => {
    expect(isEligibleReviewer({ role: FirmRole.OWNER, userId: 'o' })).toBe(true);
    expect(isEligibleReviewer({ role: FirmRole.SENIOR_LAWYER, userId: 's' })).toBe(true);
    expect(isEligibleReviewer({ role: FirmRole.LAWYER, userId: 'lead', caseLeadId: 'lead' })).toBe(true);
    expect(isEligibleReviewer({ role: FirmRole.LAWYER, userId: 'l' })).toBe(false);
    expect(isEligibleReviewer({ role: FirmRole.OFFICE_MANAGER, userId: 'om' })).toBe(false);
    expect(isEligibleReviewer({ role: FirmRole.SENIOR_LAWYER, userId: 's', assigneeId: 's' })).toBe(false);
    expect(isEligibleReviewer({ role: FirmRole.OFFICE_MANAGER, userId: 'om', caseLeadId: 'om' })).toBe(false);
    expect(isEligibleReviewer({ role: FirmRole.LAWYER, userId: 'lead', caseLeadId: 'lead', assigneeId: 'lead' })).toBe(false);
  });

  it('a lawyer may delegate to an assistant or the office manager; nothing else changes', () => {
    expect(canDelegateTask(FirmRole.LAWYER, FirmRole.ASSISTANT)).toBe(true);
    expect(canDelegateTask(FirmRole.LAWYER, FirmRole.OFFICE_MANAGER)).toBe(true);
    expect(canDelegateTask(FirmRole.LAWYER, FirmRole.LAWYER)).toBe(false);
    expect(canDelegateTask(FirmRole.LAWYER, FirmRole.SENIOR_LAWYER)).toBe(false);
    expect(canDelegateTask(FirmRole.SENIOR_LAWYER, FirmRole.LAWYER)).toBe(true);
    expect(canDelegateTask(FirmRole.ASSISTANT, FirmRole.ASSISTANT)).toBe(false);
  });

  it('maps party roles to a playbook side', () => {
    expect(partySide('PLAINTIFF')).toBe('PLAINTIFF');
    expect(partySide('PETITIONER')).toBe('PLAINTIFF');
    expect(partySide('DEFENDANT')).toBe('DEFENDANT');
    expect(partySide('RESPONDENT')).toBe('DEFENDANT');
    expect(partySide(null)).toBeNull();
  });

  it('hides internal labels and shows a readable stage chip', () => {
    const labels = ['stage:FILING', 'playbook:abc', 'ด่วน'];
    expect(visibleTaskLabels(labels)).toEqual(['ด่วน']);
    expect(taskStageChip(labels)).toBe('ขั้น: ยื่นฟ้อง');
    expect(taskStageChip(['ด่วน'])).toBeNull();
    expect(taskStageChip(['stage:NOPE'])).toBeNull();
  });

  it('exposes the handoff note minimum', () => {
    expect(TASK_HANDOFF_NOTE_MIN).toBe(5);
  });
});

describe('default playbook tags', () => {
  const civil = DEFAULT_PLAYBOOKS.find((p) => p.key === 'DEFAULT_CIVIL')!;
  const step = (title: string) => civil.steps.find((s) => s.title === title)!;

  it('tags the civil answer/default-judgment steps by side', () => {
    expect(step('ยื่นคำให้การ (กรณีเป็นฝ่ายจำเลย)').side).toBe('DEFENDANT');
    expect(step('ขอให้ศาลพิพากษาโดยขาดนัดยื่นคำให้การ (ฝ่ายโจทก์)').side).toBe('PLAINTIFF');
  });

  it('tags the criminal and family steps by side', () => {
    const steps = (key: string) => DEFAULT_PLAYBOOKS.find((p) => p.key === key)!.steps;
    expect(steps('DEFAULT_CRIMINAL').find((s) => s.title === 'ยื่นคำร้องขอปล่อยชั่วคราว (ถ้าลูกความถูกควบคุม)')!.side).toBe('DEFENDANT');
    expect(steps('DEFAULT_FAMILY').find((s) => s.title === 'ยื่นคำให้การ (กรณีเป็นฝ่ายจำเลย)')!.side).toBe('DEFENDANT');
  });

  it('requires an attachment on the civil drafting steps', () => {
    for (const title of ['ร่างคำฟ้องและบัญชีท้ายฟ้อง', 'ร่างและยื่นอุทธรณ์', 'ยื่นคำให้การ (กรณีเป็นฝ่ายจำเลย)', 'ยื่นบัญชีระบุพยานและสำเนาเอกสาร']) {
      expect(step(title).requiresAttachment).toBe(true);
    }
  });
});

describe('assignmentCandidates reviews', () => {
  it('counts a review for the reviewer, not for the worker who still holds the task', () => {
    const base = { title: 't', priority: 'MEDIUM', workType: null, size: 'M', dueDate: null, scheduledFor: null, queuePosition: 0,
      requiresReview: true, assignedAt: null, acknowledgedAt: null, completedAt: null, holdReason: null, blockedBy: null, blocker: null,
      planConfirmedAt: null, followedUpAt: null, latestUpdate: null, caseId: 'c1' } as any;
    const tasks = [{ ...base, id: 'a', status: 'PENDING_REVIEW', assigneeId: 'worker', workerId: 'worker', reviewerId: null, case: { id: 'c1', ownRef: 'R', title: 'T', leadLawyerId: 'lead' } }];
    const members = ['worker', 'lead'].map((userId) => ({ userId, firstName: userId, lastName: '', email: '', role: 'LAWYER', workTypes: [], onLeave: false, appointments: [] })) as any;
    const result = assignmentCandidates(members, tasks, 'OTHER' as any, '2026-10-12');
    expect(result.find((r) => r.member.userId === 'lead')!.reviews.map((t) => t.id)).toEqual(['a']);
    expect(result.find((r) => r.member.userId === 'worker')!.reviews).toEqual([]);
  });
});

describe('canActOnReview mirrors assertReviewer', () => {
  const base = { status: 'PENDING_REVIEW', reviewerId: null as string | null, assigneeId: 'w', caseId: 'c' as string | null, leadLawyerId: 'lead' as string | null };
  it('assignee is never the reviewer', () => {
    expect(canActOnReview({ ...base, reviewerId: 'w' }, 'w', FirmRole.SENIOR_LAWYER)).toBe(false);
    expect(awaitsReviewBy({ status: 'PENDING_REVIEW', reviewerId: 'w', assigneeId: 'w' } as any, 'w')).toBe(false);
  });
  it('office manager cannot review even when named', () => {
    expect(canActOnReview({ ...base, reviewerId: 'om' }, 'om', FirmRole.OFFICE_MANAGER)).toBe(false);
  });
  it('owner is the backstop only on reviewer-less case tasks', () => {
    expect(canActOnReview(base, 'o', FirmRole.OWNER)).toBe(true);
    expect(canActOnReview({ ...base, reviewerId: 'r' }, 'o', FirmRole.OWNER)).toBe(false);
  });
  it('standalone with a reviewer: only that reviewer', () => {
    const t = { ...base, caseId: null, leadLawyerId: null, reviewerId: 'r' };
    expect(canActOnReview(t, 'r', FirmRole.SENIOR_LAWYER)).toBe(true);
    expect(canActOnReview(t, 'o', FirmRole.OWNER)).toBe(false);
  });
  it('case lead reviews reviewer-less work; nothing outside PENDING_REVIEW', () => {
    expect(canActOnReview(base, 'lead', FirmRole.LAWYER)).toBe(true);
    expect(canActOnReview({ ...base, status: 'DONE' }, 'lead', FirmRole.LAWYER)).toBe(false);
  });
});
