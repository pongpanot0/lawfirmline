import { caseJourney, preLitChecklist } from './case-journey';
import { caseProgress } from './case-progress';

const legalCase = { id: 'case', stage: 'PRE_LITIGATION', partyRole: null, status: 'OPEN' };
const info = { title: 'คดี', clientId: 'client' };
const request = { required: true, status: 'REQUESTED' };
const task = (patch: Partial<Parameters<typeof caseJourney>[1][number]> = {}) => ({
  id: 'task', title: 'ยื่นคำให้การ', status: 'TODO', parentId: null,
  labels: ['stage:PRE_LITIGATION'], assignee: null, dueDate: null, skippedReason: null, ...patch,
});
const court = '2026-12-01T03:00:00.000Z';
const journey = (options: { tasks?: ReturnType<typeof task>[]; conflict?: { result: string } | null; requests?: typeof request[]; missing?: string[] } = {}) =>
  caseJourney(legalCase, options.tasks ?? [], [], preLitChecklist(info, options.conflict === undefined ? { result: 'CLEAR' } : options.conflict, options.requests ?? []), options.missing ?? []);

describe('caseProgress bucket and next priority', () => {
  it.each(['CLOSED', 'ARCHIVED'])('%s wins over info, checklist, tasks, document requests and court dates', (status) => {
    expect(caseProgress({ ...legalCase, status }, journey({ missing: ['ข้อหา'], conflict: null, tasks: [task()], requests: [request] }), [request], court))
      .toMatchObject({ bucket: 'CLOSED', next: null });
  });
  it('INFO wins over checklist, tasks, waiting documents and court dates', () => {
    expect(caseProgress(legalCase, journey({ missing: ['ข้อหา'], conflict: null, tasks: [task()], requests: [request] }), [request], court))
      .toMatchObject({ bucket: 'TODO', next: { kind: 'INFO', text: 'เติมข้อมูลคดีให้ครบ (ข้อหา)' } });
  });
  it('an incomplete non-document checklist item wins over waiting documents and court dates', () => {
    expect(caseProgress(legalCase, journey({ conflict: null, requests: [request], tasks: [task()] }), [request], court))
      .toMatchObject({ bucket: 'TODO', next: { kind: 'PRELIT', text: 'ตรวจผลประโยชน์ขัดกัน' } });
  });
  it('uses the action text when the pre-lit info step is incomplete', () => {
    const result = caseJourney(legalCase, [], [], preLitChecklist({ title: ' ', clientId: 'client' }, { result: 'CLEAR' }, []));
    expect(caseProgress(legalCase, result, [], null).next).toEqual({ kind: 'PRELIT', text: 'กรอกชื่อเรื่องให้ครบ' });
  });
  it('a current-stage task keeps the case TODO even when its document checklist is pending', () => {
    expect(caseProgress(legalCase, journey({ tasks: [task()], requests: [request] }), [request], court))
      .toMatchObject({ bucket: 'TODO', next: { kind: 'PRELIT', text: 'เอกสารจากลูกความ' } });
  });
  it('a pending task wins over advancing, waiting documents and court dates', () => {
    expect(caseProgress(legalCase, journey({ tasks: [task()] }), [request], court))
      .toMatchObject({ bucket: 'TODO', next: { kind: 'TASK', text: 'ยื่นคำให้การ', taskId: 'task' } });
  });
  it.each(['REQUESTED', 'MISSING'])('required %s documents alone wait for client before court', (status) => {
    const requests = [{ required: true, status }];
    expect(caseProgress(legalCase, journey({ requests }), requests, court))
      .toMatchObject({ bucket: 'WAITING_CLIENT', next: { kind: 'PRELIT', text: 'เอกสารจากลูกความ' } });
  });
  it.each([
    { required: false, status: 'REQUESTED' }, { required: false, status: 'MISSING' },
    { required: true, status: 'RECEIVED' }, { required: true, status: 'NOT_REQUIRED' },
  ])('ignores optional/resolved document requests: %j', (document) => {
    expect(caseProgress(legalCase, journey({ requests: [document] }), [document], court).bucket).toBe('WAITING_COURT');
  });
  it('waits for a court date after all pending work is resolved', () => {
    expect(caseProgress(legalCase, journey(), [], court)).toEqual({
      caseId: 'case', bucket: 'WAITING_COURT', stepIndex: 0, stepTotal: 8,
      stepLabel: 'ก่อนฟ้อง', done: 3, total: 3,
      next: { kind: 'ADVANCE', text: 'ไปขั้นยื่นฟ้อง' }, nextCourtDate: court,
    });
  });
  it('falls back to TODO with ADVANCE or SET_NEXT and has null next only for CLOSED', () => {
    expect(caseProgress(legalCase, journey(), [], null)).toMatchObject({ bucket: 'TODO', next: { kind: 'ADVANCE', text: 'ไปขั้นยื่นฟ้อง' } });
    const closing = { ...legalCase, stage: 'CLOSING' };
    expect(caseProgress(closing, caseJourney(closing, [], []), [], null))
      .toMatchObject({ bucket: 'TODO', next: { kind: 'SET_NEXT', text: 'กำหนดขั้นถัดไป' } });
  });
  it('counts only current-stage tasks plus pre-lit checks, counting skipped tasks done', () => {
    const tasks = [task({ status: 'DONE' }), task({ id: 'skip', skippedReason: 'ไม่ใช้' }), task({ id: 'open' }), task({ id: 'other', labels: ['stage:FILING'] })];
    expect(caseProgress(legalCase, journey({ tasks }), [], null)).toMatchObject({ done: 5, total: 6 });
  });
  it.each(['APPEAL', 'SUPREME'])('uses all nine steps for %s', (stage) => {
    const row = { ...legalCase, stage };
    expect(caseProgress(row, caseJourney(row, [], []), [], null)).toMatchObject({ stepIndex: 6, stepTotal: 9, done: 0, total: 0 });
  });
  it('includes task title, ISO deadline and assignee in the next action', () => {
    const tasks = [task({ dueDate: new Date(court), assignee: { firstName: 'สมชาย', lastName: 'ใจดี' } })];
    expect(caseProgress(legalCase, journey({ tasks }), [], null).next).toEqual({ kind: 'TASK', text: 'ยื่นคำให้การ', taskId: 'task', dueDate: court, assigneeName: 'สมชาย ใจดี' });
  });
  it('omits absent optional task fields', () => {
    expect(caseProgress(legalCase, journey({ tasks: [task()] }), [], null).next).toEqual({ kind: 'TASK', text: 'ยื่นคำให้การ', taskId: 'task' });
  });
});
