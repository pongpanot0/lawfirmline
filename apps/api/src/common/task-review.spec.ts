import {
  DEFAULT_PLAYBOOKS,
  FirmRole,
  TASK_HANDOFF_NOTE_MIN,
  awaitsReviewBy,
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

  it('requires an attachment on the civil drafting steps', () => {
    for (const title of ['ร่างคำฟ้องและบัญชีท้ายฟ้อง', 'ร่างและยื่นอุทธรณ์', 'ยื่นคำให้การ (กรณีเป็นฝ่ายจำเลย)', 'ยื่นบัญชีระบุพยานและสำเนาเอกสาร']) {
      expect(step(title).requiresAttachment).toBe(true);
    }
  });
});
