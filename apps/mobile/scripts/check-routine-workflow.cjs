// Run after the shared build: node apps/mobile/scripts/check-routine-workflow.cjs
const assert = require('node:assert/strict');
const { assignmentCandidates, assignmentWarnings, ownerDecisionTasks, DEFAULT_OFFICE_ROUTINES, TaskWorkType, routineMissing, taskRoutineSnapshot, dailyUpdateParts } = require('../../../packages/shared/dist');
const member = { userId: 'worker', firstName: 'Worker', lastName: '', role: 'ASSISTANT', workTypes: [TaskWorkType.DOCUMENTS], onLeave: false, appointments: [] };
const task = { id: 't', workerId: 'worker', assigneeId: 'worker', status: 'TODO', size: 'M', dueDate: null, scheduledFor: '2026-10-02', latestUpdate: null };
const candidate = tasks => assignmentCandidates([member], tasks, TaskWorkType.DOCUMENTS, '2026-10-02')[0];
assert.equal(candidate([task]).unknownCount, 1);
assert.equal(candidate([{ ...task, latestUpdate: { authorId: 'worker', createdAt: '2026-10-01T16:00:00Z' } }]).unknownCount, 1);
assert.equal(candidate([{ ...task, latestUpdate: { authorId: 'other', createdAt: '2026-10-02T03:00:00Z' } }]).unknownCount, 1);
assert.equal(candidate([{ ...task, latestUpdate: { authorId: 'worker', createdAt: '2026-10-01T18:00:00Z' } }]).unknownCount, 0);
const review = { ...task, status: 'PENDING_REVIEW', workerId: 'sender' };
assert.equal(candidate([review]).queue.length, 0); assert.equal(candidate([review]).reviews.length, 1);
assert.ok(assignmentWarnings(candidate([])).some(message => message.includes('ยังสรุปว่าว่างไม่ได้')));
const conflict = { ...candidate([task]), member: { ...member, onLeave: true, appointments: [{ endAt: null }] } };
assert.ok(assignmentWarnings(conflict).some(message => message.includes('วันลา')));
assert.ok(assignmentWarnings(conflict).some(message => message.includes('เวลาสิ้นสุด')));
const routine = taskRoutineSnapshot({ id: 'r', name: 'Office SOP', version: 2 }, 0, { expectedOutput: 'PDF ตรวจครบ', checks: ['ตรวจต้นฉบับ', 'เปิดตรวจผล'], attachment: 'PDF' });
assert.equal(routineMissing(routine, [], []).length, 3);
assert.equal(routineMissing(routine, [0, 1], [{ mimeType: 'image/jpeg' }]).length, 1);
assert.equal(routineMissing(routine, [0, 1], [{ mimeType: 'application/pdf' }], 'เอกสารขาด').length, 1);
assert.equal(routineMissing(routine, [0, 1], [{ mimeType: 'application/pdf' }]).length, 0);
assert.equal(routineMissing(null, [], [], 'ติดขัด').length, 0);
assert.equal(routineMissing(routine, [], [{ mimeType: 'application/pdf' }]).length, 2); // revision requires fresh checks
assert.equal(dailyUpdateParts('ทำถึงไหน: ตรวจแล้ว\nเหลืออะไร: รอตรวจ\nติดอะไร: ไม่มี').blocker, '');
assert.equal(dailyUpdateParts('ทำถึงไหน: ตรวจแล้ว\nเหลืออะไร: รอต้นฉบับ\nติดอะไร: เอกสารขาด').blocker, 'เอกสารขาด');
assert.deepEqual(ownerDecisionTasks([
  { ...task, id: 'done', status: 'DONE', blocker: 'old blocker' },
  { ...task, id: 'review', status: 'PENDING_REVIEW' },
  { ...task, id: 'overdue', dueDate: '2026-10-01T16:59:59Z' },
  { ...task, id: 'unassigned', assigneeId: null },
  { ...task, id: 'blocked', blocker: 'เอกสารขาด' },
], '2026-10-02').map(row => row.task.id), ['blocked', 'unassigned', 'overdue', 'review']);
assert.equal(DEFAULT_OFFICE_ROUTINES.length, 5);
for (const playbook of DEFAULT_OFFICE_ROUTINES) {
  const snapshot = taskRoutineSnapshot({ id: playbook.key, name: playbook.name, version: 1 }, 0, playbook.steps[0].routine);
  assert.ok(snapshot.sourceTemplate && snapshot.exampleOutput && snapshot.missingDocuments && snapshot.sourceHint);
  assert.ok(snapshot.exampleOutput.includes('สมมติ'));
  assert.ok(routineMissing(snapshot, [0, 1, 2], [{ mimeType: 'application/pdf' }], 'เอกสารขาด').length);
}
console.log('PASS: workload dates/unknown/review separation, assignment risks, routine readiness and revision checks');
