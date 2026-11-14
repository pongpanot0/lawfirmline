import { FirmRole, TaskPriority, TaskStatus } from '@lawfirm/shared';
import { todoAssignmentProblem } from '../../tasks/todo-assignment';
import { resolveTaskRows, taskSignature } from './tasks.kind';
import { importUser, row, staffLookups } from './import-kind.fixtures';

const base = { 'ชื่องาน *': 'ตรวจเอกสาร' };
const one = (values: Record<string, string> = {}, user = importUser) => resolveTaskRows([row({ ...base, ...values })], staffLookups(), user)[0];
describe('tasks import resolver and shared assignment rule', () => {
  it('uses service defaults, resolves staff/case refs and preserves completed status', () => {
    expect(one()).toMatchObject({ problems: [], priority: TaskPriority.MEDIUM, status: TaskStatus.TODO, assigneeId: undefined });
    const draft = one({ เลขอ้างอิงคดี: 'REF001', 'ผู้รับผิดชอบ (อีเมล)': ' LAWYER@EXAMPLE.COM ', กำหนดเสร็จ: '15/12/2569', ความสำคัญ: 'สูง', สถานะ: 'เสร็จแล้ว' });
    expect(draft).toMatchObject({ problems: [], caseId: 'case-a', assigneeId: 'lawyer', priority: TaskPriority.HIGH, status: TaskStatus.DONE, refs: { userIds: ['lawyer'] } });
    expect(draft.cells['ผู้รับผิดชอบ (อีเมล)']).toContain('ทนาย หนึ่ง');
    expect(draft.dueDate?.toISOString()).toBe('2026-12-15T00:00:00.000Z');
    expect(one({ สถานะ: 'กำลังทำ', ความสำคัญ: 'ต่ำ' })).toMatchObject({ status: TaskStatus.IN_PROGRESS, priority: TaskPriority.LOW });
  });
  it.each([
    [{ 'ชื่องาน *': '' }, 'ชื่องาน'], [{ เลขอ้างอิงคดี: 'FOREIGN' }, 'ไม่พบคดี FOREIGN หรือคุณไม่มีสิทธิ์ในคดีนี้'],
    [{ 'ผู้รับผิดชอบ (อีเมล)': 'not-email' }, 'อีเมลไม่ถูกต้อง'], [{ 'ผู้รับผิดชอบ (อีเมล)': 'external@example.com' }, 'ไม่พบสมาชิก'],
    [{ กำหนดเสร็จ: '31/02/2569' }, 'วันที่ไม่ถูกต้อง'], [{ ความสำคัญ: 'ด่วนที่สุด' }, 'ความสำคัญ'], [{ ความสำคัญ: 'constructor' }, 'ความสำคัญ'], [{ สถานะ: 'toString' }, 'สถานะ'], [{ สถานะ: 'เก็บแล้ว' }, 'สถานะ'],
  ] as [Record<string, string>, string][])('reports invalid tasks %p', (values, message) => expect(one(values).problems.join(' ')).toContain(message));
  it('rejects duplicates within the file and existing work using a stable natural signature', () => {
    const lookups = staffLookups(); lookups.existing.add(taskSignature(one()));
    expect(resolveTaskRows([row(base)], lookups, importUser)[0].problems.join(' ')).toContain('ในระบบแล้ว');
    expect(resolveTaskRows([row(base), row(base, 3)], staffLookups(), importUser)[1].problems.join(' ')).toContain('แถวที่ 2');
  });
  it('applies hierarchy rules to case tasks and standalone work', () => {
    const assistant = { ...importUser, id: 'assistant', firmRole: FirmRole.ASSISTANT };
    expect(one({ เลขอ้างอิงคดี: 'REF001', 'ผู้รับผิดชอบ (อีเมล)': 'lawyer@example.com' }, assistant).problems.join(' ')).toContain('ผู้ช่วยมอบหมายงานให้ผู้อื่นไม่ได้');
    const lawyer = { ...importUser, id: 'lawyer', firmRole: FirmRole.LAWYER };
    expect(one({ 'ผู้รับผิดชอบ (อีเมล)': 'owner@example.com' }, lawyer).problems.join(' ')).toContain('เฉพาะผู้ช่วย');
    expect(one({ 'ผู้รับผิดชอบ (อีเมล)': 'assistant@example.com' }, lawyer).problems).toEqual([]);
    expect(todoAssignmentProblem(lawyer, 'unknown', null)?.kind).toBe('notFound');
    expect(todoAssignmentProblem(importUser, 'external', FirmRole.EXTERNAL)?.kind).toBe('notFound');
    expect(todoAssignmentProblem({ ...importUser, id: 'senior', firmRole: FirmRole.SENIOR_LAWYER }, 'owner', FirmRole.OWNER)?.message).toContain('บทบาทต่ำกว่า');
    expect(todoAssignmentProblem(assistant, assistant.id)).toBeNull();
    expect(one({}, { ...importUser, firmRole: FirmRole.EXTERNAL }).problems.join(' ')).toContain('ไม่มีสิทธิ์');
  });
});
