import { CaseStage } from '@lawfirm/shared';
import { caseJourney, MAIN_JOURNEY_STAGES, nextJourneyStage, preLitChecklist } from './case-journey';

const legalCase = { stage: 'FILING', partyRole: null };
const task = (patch: Partial<Parameters<typeof caseJourney>[1][number]> = {}) => ({ id: 't1', title: 'ยื่นฟ้อง', status: 'TODO', parentId: null, labels: ['stage:FILING'], assignee: null, dueDate: null, skippedReason: null, ...patch });

describe('caseJourney', () => {
  it('prioritizes missing case info over the pre-lit checklist and tasks', () => {
    const preLit = preLitChecklist({ title: 'คดี', clientId: 'client' }, null, []);
    const result = caseJourney({ ...legalCase, stage: 'PRE_LITIGATION' }, [task({ labels: ['stage:PRE_LITIGATION'] })], [], preLit, ['ข้อหา', 'คู่ความ']);
    expect(result).toMatchObject({
      infoMissing: ['ข้อหา', 'คู่ความ'], canAdvance: false,
      next: { kind: 'INFO', text: 'เติมข้อมูลคดีให้ครบ (ข้อหา, คู่ความ)', done: 0, total: 1 },
      blockers: ['ข้อมูลคดียังไม่ครบ: ข้อหา, คู่ความ', expect.any(String), expect.any(String)],
    });
  });
  it('prioritizes the pre-lit next over pending tasks and labels every next action', () => {
    const preLit = preLitChecklist({ title: 'คดี', clientId: 'client' }, null, []);
    expect(caseJourney({ ...legalCase, stage: 'PRE_LITIGATION' }, [task({ labels: ['stage:PRE_LITIGATION'] })], [], preLit).next)
      .toEqual({ ...preLit.next, kind: 'PRELIT' });
    expect(caseJourney(legalCase, [task()], []).next).toMatchObject({ kind: 'TASK', done: 0, total: 1 });
    expect(caseJourney(legalCase, [], [])).toMatchObject({ infoMissing: [], next: { kind: 'ADVANCE', done: 0, total: 0 } });
  });
  it.each(MAIN_JOURNEY_STAGES)('marks stages before %s done, itself current and later stages locked', (stage) => {
    const result = caseJourney({ ...legalCase, stage }, [], []);
    const current = MAIN_JOURNEY_STAGES.indexOf(stage);
    expect(result.steps.map((s) => s.key)).toEqual(MAIN_JOURNEY_STAGES);
    result.steps.forEach((step, index) => {
      expect(step.state).toBe(index < current ? 'done' : index === current ? 'current' : 'locked');
      expect(!!step.summary).toBe(index < current);
      expect(!!step.unlockHint).toBe(index > current);
    });
  });
  it.each(['INTAKE_REVIEW', 'FACT_GATHERING'])('maps %s and its tasks to PRE_LITIGATION', (stage) => {
    const result = caseJourney({ ...legalCase, stage }, [task({ labels: [`stage:${stage}`] }), task({ id: 'pre', labels: ['stage:PRE_LITIGATION'] })], []);
    expect(result.steps[0]).toMatchObject({ key: 'PRE_LITIGATION', state: 'current' });
    expect(result.currentTasks).toHaveLength(2);
  });
  it.each(['APPEAL', 'SUPREME'])('inserts %s after judgment as current; enforcement/closing remain locked', (stage) => {
    const steps = caseJourney({ ...legalCase, stage }, [], []).steps;
    expect(steps.map((s) => s.key)).toEqual([...MAIN_JOURNEY_STAGES.slice(0, 6), stage, ...MAIN_JOURNEY_STAGES.slice(6)]);
    expect(steps[5].state).toBe('done');
    expect(steps[6].state).toBe('current');
    expect(steps.slice(7).map((s) => s.state)).toEqual(['locked', 'locked']);
  });
  it('has no blockers with zero current tasks', () => {
    expect(caseJourney(legalCase, [], [])).toMatchObject({ canAdvance: true, blockers: [], currentTasks: [], next: { done: 0, total: 0 } });
  });
  it.each(['TODO', 'IN_PROGRESS', 'PENDING_REVIEW', 'NEEDS_REVISION'])('blocks unresolved %s tasks', (status) => {
    expect(caseJourney(legalCase, [task({ status })], [])).toMatchObject({ canAdvance: false, blockers: ['งานยังไม่เสร็จหรือข้าม: ยื่นฟ้อง'], next: { done: 0, total: 1 } });
  });
  it('resolves DONE and skipped tasks, but not an empty skippedReason', () => {
    const result = caseJourney(legalCase, [task({ status: 'DONE' }), task({ id: 'skip', skippedReason: 'ไม่จำเป็น' })], []);
    expect(result).toMatchObject({ canAdvance: true, blockers: [], next: { done: 2, total: 2 } });
    expect(caseJourney(legalCase, [task({ skippedReason: '' })], []).canAdvance).toBe(false);
  });
  it('returns only the exact currentTasks fields, serializing dueDate and assignee', () => {
    expect(caseJourney(legalCase, [task({ assignee: { firstName: 'สมชาย', lastName: 'ใจดี' }, dueDate: new Date('2026-11-10T00:00:00Z') })], []).currentTasks).toEqual([
      { id: 't1', title: 'ยื่นฟ้อง', status: 'TODO', assigneeName: 'สมชาย ใจดี', dueDate: '2026-11-10T00:00:00.000Z', skippedReason: null },
    ]);
  });
  it('excludes tasks from other stages and unrelated manual tasks', () => {
    expect(caseJourney(legalCase, [task({ labels: ['stage:ANSWER'] }), task({ id: 'manual', labels: [] })], []).currentTasks).toEqual([]);
  });
  it('keeps an outstanding parent as a blocker after its subtask is DONE', () => {
    const result = caseJourney(legalCase, [task({ id: 'parent' }), task({ parentId: 'parent', labels: [], status: 'DONE' })], []);
    expect(result.canAdvance).toBe(false);
    expect(result.currentTasks.map((t) => t.id)).toEqual(['parent', 't1']);
    expect(result.blockers).toEqual(['งานยังไม่เสร็จหรือข้าม: ยื่นฟ้อง']);
  });
  it.each(['label', 'playbook'])('inherits %s stage membership for unlabelled descendants', (membership) => {
    const tasks = [task({ id: 'parent', labels: membership === 'label' ? ['stage:FILING'] : [], status: 'DONE' }), task({ parentId: 'parent', labels: [] }), task({ id: 'grandchild', parentId: 't1', labels: [], title: 'งานย่อย' })];
    const applied = membership === 'playbook' ? [{ taskIds: ['parent'], release: { steps: [{ title: 'ยื่นฟ้อง', stage: 'FILING' }] } }] : [];
    const result = caseJourney(legalCase, tasks, applied);
    expect(result.currentTasks.map((t) => t.id)).toEqual(['parent', 't1', 'grandchild']);
    expect(result.blockers).toHaveLength(2);
    expect(result.canAdvance).toBe(false);
  });
  it('lets a subtask with its own stage override its parent’s membership', () => {
    const result = caseJourney(legalCase, [task({ id: 'parent', status: 'DONE' }), task({ parentId: 'parent', labels: ['stage:ANSWER'] })], []);
    expect(result.currentTasks.map((t) => t.id)).toEqual(['parent']);
    expect(result.canAdvance).toBe(true);
  });
  it('uses stage labels for renamed tasks and explicit labels override legacy title matching', () => {
    const result = caseJourney(legalCase, [task({ title: 'เปลี่ยนชื่อแล้ว' }), task({ id: 'other', labels: ['stage:ANSWER'] })], [{ taskIds: ['other'], release: { steps: [{ title: 'ยื่นฟ้อง', stage: 'FILING' }] } }]);
    expect(result.currentTasks.map((t) => t.id)).toEqual(['t1']);
  });
  it('links legacy tasks through AppliedPlaybook membership and release step stage; never array position', () => {
    const tasks = [task({ labels: [], id: 'unrelated' }), task({ labels: [], id: 'legacy' }), task({ labels: [], title: 'คำให้การ', id: 'answer' })];
    const result = caseJourney(legalCase, tasks, [{ taskIds: ['answer', 'legacy'], release: { steps: [{ title: 'คำให้การ', stage: 'ANSWER' }, { title: 'ยื่นฟ้อง', stage: 'FILING' }] } }]);
    expect(result.currentTasks.map((t) => t.id)).toEqual(['legacy']);
  });
  it('maps un-staged legacy steps to pre-litigation only and tolerates malformed steps JSON', () => {
    const applied = [{ taskIds: ['t1'], release: { steps: [{ title: 'ยื่นฟ้อง' }, null, {}] } }, { taskIds: ['t1'], release: { steps: {} } }];
    expect(caseJourney(legalCase, [task({ labels: [] })], applied).currentTasks).toEqual([]);
    expect(caseJourney({ ...legalCase, stage: 'PRE_LITIGATION' }, [task({ labels: [] })], applied).currentTasks).toHaveLength(1);
  });
  it('matches sided legacy task titles using existing title/side rules', () => {
    const applied = [{ taskIds: ['t1'], release: { steps: [{ title: 'ยื่นฟ้อง', stage: 'FILING', side: 'PLAINTIFF' }] } }];
    expect(caseJourney(legalCase, [task({ labels: [], title: 'ยื่นฟ้อง (ถ้าเป็นฝ่ายโจทก์)' })], applied).currentTasks).toHaveLength(1);
    expect(caseJourney({ ...legalCase, partyRole: 'DEFENDANT' }, [task({ labels: [] })], applied).currentTasks).toHaveLength(0);
  });
  it('has no next action after all closing tasks resolve', () => {
    expect(caseJourney({ ...legalCase, stage: 'CLOSING' }, [], [])).toMatchObject({ next: null, canAdvance: true });
  });
});

describe('nextJourneyStage', () => {
  it.each(MAIN_JOURNEY_STAGES.map((stage, i) => [stage, MAIN_JOURNEY_STAGES[i + 1] ?? null]))('advances %s to %s', (stage, next) => expect(nextJourneyStage(stage!)).toBe(next));
  it.each(['INTAKE_REVIEW', 'FACT_GATHERING'])('advances alias %s to FILING', (stage) => expect(nextJourneyStage(stage)).toBe('FILING'));
  it.each(['APPEAL', 'SUPREME'])('returns from %s to ENFORCEMENT', (stage) => expect(nextJourneyStage(stage)).toBe('ENFORCEMENT'));
  it.each([[CaseStage.AWAITING_JUDGMENT, CaseStage.APPEAL], [CaseStage.APPEAL, CaseStage.SUPREME], [CaseStage.PRE_LITIGATION, CaseStage.CLOSING]])('allows %s → %s', (from, to) => expect(nextJourneyStage(from, to)).toBe(to));
  it.each([[CaseStage.PRE_LITIGATION, CaseStage.SUPREME], [CaseStage.AWAITING_JUDGMENT, CaseStage.SUPREME], [CaseStage.FILING, CaseStage.APPEAL], [CaseStage.ENFORCEMENT, CaseStage.APPEAL]])('refuses branch %s → %s', (from, to) => expect(nextJourneyStage(from, to)).toBeNull());
  it.each([CaseStage.FILING, CaseStage.ANSWER, CaseStage.ENFORCEMENT])('refuses explicit main-path target %s', (toStage) => expect(nextJourneyStage('PRE_LITIGATION', toStage)).toBeNull());
  it('refuses same-stage targets', () => expect(nextJourneyStage('CLOSING', CaseStage.CLOSING)).toBeNull());
});

describe('opening-stage journey', () => {
  it('distinguishes skipped-at-open steps from steps passed later', () => {
    const result = caseJourney({ stage: 'HEARING', partyRole: null, openedAtStage: 'ANSWER' } as any, [], []);
    expect(result.steps.slice(0, 2)).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'PRE_LITIGATION', summary: 'ข้ามตอนเปิดคดี', skippedAtOpen: true }),
      expect.objectContaining({ key: 'FILING', summary: 'ข้ามตอนเปิดคดี', skippedAtOpen: true }),
    ]));
    expect(result.steps[2]).toMatchObject({ summary: 'ผ่านขั้นตอนนี้แล้ว' });
    expect(result.steps[2]).not.toHaveProperty('skippedAtOpen');
  });
  it('treats null opening stage as legacy pre-litigation', () => {
    expect(caseJourney({ ...legalCase, openedAtStage: null } as any, [], []).steps[0]).toMatchObject({ summary: 'ผ่านขั้นตอนนี้แล้ว' });
  });
});
