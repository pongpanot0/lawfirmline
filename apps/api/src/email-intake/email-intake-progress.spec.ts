import { intakeProgress } from './email-intake-progress';

const thread = { intake: { status: 'RECEIVED' } };
const proposal = (field: string, status: string) => ({ field, status });

describe('intakeProgress', () => {
  it('highlights accept and locks subsequent steps before linking', () => {
    const result = intakeProgress({ intake: null }, [], false, false);
    expect(result.steps.map((s) => s.state)).toEqual(['current', 'locked', 'locked', 'locked', 'locked']);
  });
  it('uses audit evidence even if AI found no values', () => {
    expect(intakeProgress(thread, [], false, false).steps[1].state).toBe('current');
    expect(intakeProgress(thread, [], false, true).steps.map((s) => s.state)).toEqual(['done', 'done', 'done', 'done', 'current']);
  });
  it('counts rejected values as resolved and separates fields from files', () => {
    const proposals = [proposal('title', 'CONFIRMED'), proposal('clientName', 'REJECTED'), proposal('estimatedDamage', 'CONFLICT'), proposal('document', 'REQUIRES_CONFIRMATION')];
    const result = intakeProgress(thread, proposals, true, false);
    expect(result.steps.map((s) => s.state)).toEqual(['done', 'done', 'current', 'locked', 'locked']);
    expect(result.next).toEqual({ text: 'ยืนยันข้อมูลอีก 1 รายการ แล้วไปขั้นจัดเอกสาร', done: 2, total: 3 });
    proposals[2].status = 'REJECTED';
    expect(intakeProgress(thread, proposals, true, false).steps[3].state).toBe('current');
    proposals[3].status = 'REJECTED';
    expect(intakeProgress(thread, proposals, true, false).steps[4].state).toBe('current');
  });
  it('does not block on a file proposal whose file was deleted', () => {
    const orphan = { field: 'document', status: 'REQUIRES_CONFIRMATION', sourceDocumentId: null };
    expect(intakeProgress(thread, [orphan], true, true).steps[3].state).toBe('done');
  });
  it('a thread linked straight to a case is past the accept step', () => {
    expect(intakeProgress({ intake: null, case: { id: 'c' } }, [], false, false).steps[0].state).toBe('done');
  });
  it('does not block on files that do not exist', () => {
    expect(intakeProgress(thread, [proposal('document', 'SUGGESTED')], false, false).steps[3].state).toBe('done');
  });
  it.each(['CONVERTED', 'CONSULTED', 'REJECTED'])('finishes submit at %s', (status) => {
    const result = intakeProgress({ intake: { status } }, [], false, true);
    expect(result.steps.every((s) => s.state === 'done')).toBe(true);
    expect(result.next).toBeNull();
  });
  it.each(['ASSESSING', 'ACCEPTED'])('still asks for the pre-litigation case at %s without one', (status) => {
    const result = intakeProgress({ intake: { status } }, [], false, true);
    expect(result.steps[4]).toMatchObject({ label: 'สร้างคดีก่อนฟ้อง', state: 'current' });
  });
  it('finishes submit when the thread has a case', () => {
    expect(intakeProgress({ ...thread, case: { id: 'c' } }, [], false, true).next).toBeNull();
  });
});
