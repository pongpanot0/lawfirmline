import { AuthUser, TASK_PRIORITY_LABELS, TaskPriority, TaskStatus } from '@lawfirm/shared';
import type { RawImportRow } from '../../common/excel-import/types';
import { firmTaskScope } from '../../common/firm-refs';
import { todoAssignmentProblem } from '../../tasks/todo-assignment';
import type { ImportDraft, ImportKindDef, ImportKindDeps } from '../import-kind';
import { checkDuplicate, dayKey, draftFor, importDate, memberHelp, ownValue, requiredText, resolveCase, resolveMember, signature, staffCanImport, staffCases, StaffCaseLookups } from '../kind-helpers';

export const TASK_HEADERS = ['ชื่องาน *', 'เลขอ้างอิงคดี', 'ผู้รับผิดชอบ (อีเมล)', 'กำหนดเสร็จ', 'ความสำคัญ', 'สถานะ', 'รายละเอียด'] as const;
const STATUS: Record<string, TaskStatus> = { 'ยังไม่เริ่ม': TaskStatus.TODO, 'กำลังทำ': TaskStatus.IN_PROGRESS, 'เสร็จแล้ว': TaskStatus.DONE };
const PRIORITY = Object.fromEntries(Object.entries(TASK_PRIORITY_LABELS).map(([key, value]) => [value, key as TaskPriority]));
export interface TaskDraft extends ImportDraft { title: string; caseId?: string; assigneeId?: string; dueDate?: Date; priority: TaskPriority; status: TaskStatus; description?: string }
/** Same work = normalized title, accessible case (or none), assignee (or none), and due day. */
export const taskSignature = (task: Pick<TaskDraft, 'title' | 'caseId' | 'assigneeId' | 'dueDate'>) => signature(task.title, task.caseId, task.assigneeId, dayKey(task.dueDate));
export function resolveTaskRows(rows: RawImportRow[], lookups: StaffCaseLookups, user: AuthUser): TaskDraft[] {
  const seen = new Map<string, number>();
  return rows.map((row) => {
    const draft = draftFor(row, user);
    const title = requiredText(draft, TASK_HEADERS[0]);
    const legalCase = resolveCase(draft, lookups, 'เลขอ้างอิงคดี');
    // No case and no assignee = the importer's own task, like /todos; otherwise it would belong to nobody.
    const member = resolveMember(draft, lookups, 'ผู้รับผิดชอบ (อีเมล)', legalCase ? undefined : user.id);
    if (member) {
      const problem = todoAssignmentProblem(user, member.id, member.role);
      if (problem) draft.problems.push(`ผู้รับผิดชอบ (อีเมล): ${member.email} ${problem.message}`);
    }
    const dueDate = importDate(draft, row, 'กำหนดเสร็จ');
    const priorityText = draft.cells['ความสำคัญ'];
    const statusText = draft.cells['สถานะ'];
    const priority = priorityText ? ownValue(PRIORITY, priorityText) : TaskPriority.MEDIUM;
    const status = statusText ? ownValue(STATUS, statusText) : TaskStatus.TODO;
    if (priorityText && !priority) draft.problems.push(`ความสำคัญ: ไม่ถูกต้อง ${priorityText}`);
    if (statusText && !status) draft.problems.push(`สถานะ: ไม่ถูกต้อง ${statusText}`);
    const result = { ...draft, title, caseId: legalCase?.id, assigneeId: member?.id, dueDate, priority: priority ?? TaskPriority.MEDIUM, status: status ?? TaskStatus.TODO, description: draft.cells['รายละเอียด'] || undefined };
    if (title) checkDuplicate(result, taskSignature(result), lookups.existing, seen, TASK_HEADERS[0]);
    return result;
  });
}
export function tasksKind(deps: ImportKindDeps): ImportKindDef<TaskDraft, StaffCaseLookups> {
  return {
    kind: 'tasks', label: 'งาน', sheet: 'งาน', headers: TASK_HEADERS, required: [TASK_HEADERS[0]], canImport: staffCanImport,
    help: {
      'ชื่องาน *': 'ชื่องาน ห้ามซ้ำกับชื่อ/คดี/ผู้รับผิดชอบ/กำหนดเสร็จเดียวกัน', 'เลขอ้างอิงคดี': 'เลขอ้างอิงภายในคดีที่คุณเข้าถึงได้ เว้นว่าง = งานทั่วไป',
      'ผู้รับผิดชอบ (อีเมล)': 'อีเมลสมาชิกในสำนักงาน มอบหมายได้ตามลำดับบทบาท เว้นว่าง: งานในคดียังไม่มอบหมาย งานที่ไม่มีคดีเป็นของผู้นำเข้า', 'กำหนดเสร็จ': 'วว/ดด/ปปปป (พ.ศ. หรือ ค.ศ.)',
      'ความสำคัญ': 'สูง/กลาง/ต่ำ เว้นว่าง = กลาง', 'สถานะ': 'ยังไม่เริ่ม/กำลังทำ/เสร็จแล้ว เว้นว่าง = ยังไม่เริ่ม', 'รายละเอียด': 'รายละเอียดงาน',
    },
    template: (lookups, user) => ({ dropdowns: [['ความสำคัญ', Object.keys(PRIORITY)], ['สถานะ', Object.keys(STATUS)]], dateHeaders: ['กำหนดเสร็จ'], examples: [['เตรียมเอกสาร', lookups.cases[0]?.ownRef ?? '', user.email, '15/12/2569', 'กลาง', 'ยังไม่เริ่ม', 'ตรวจเอกสารก่อนส่ง']], extraHelp: memberHelp(lookups.members) }),
    async lookups(db, user) {
      const refs = await staffCases(db, user, deps);
      const tasks = await db.task.findMany({
        where: { AND: [firmTaskScope(user.firmId), deps.caseAccess.getTaskAccessFilterForUser(user)], parentId: null },
        select: { title: true, caseId: true, assigneeId: true, dueDate: true },
      });
      return { ...refs, existing: new Set(tasks.map((task) => taskSignature({ title: task.title, caseId: task.caseId ?? undefined, assigneeId: task.assigneeId ?? undefined, dueDate: task.dueDate ?? undefined }))) };
    },
    resolve: resolveTaskRows,
    async commit(tx, user, drafts) {
      const now = new Date();
      for (const draft of drafts) await tx.task.create({ data: {
        title: draft.title, description: draft.description, caseId: draft.caseId, assigneeId: draft.assigneeId, dueDate: draft.dueDate,
        priority: draft.priority, status: draft.status, source: 'WEB', firmId: user.firmId, createdById: user.id,
        completedAt: draft.status === TaskStatus.DONE ? now : undefined,
        assignedAt: draft.assigneeId && draft.assigneeId !== user.id ? now : undefined,
        acknowledgedAt: draft.assigneeId === user.id ? now : undefined,
      } });
      return { created: drafts.length };
    },
  };
}
