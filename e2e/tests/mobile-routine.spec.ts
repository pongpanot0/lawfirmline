import { test, expect, APIResponse } from '@playwright/test';
import { localTestData } from '../helpers/test-data';

const API = process.env.E2E_API_URL ?? 'http://localhost:3001';
async function ok(response: APIResponse) { expect(response.ok(), await response.text()).toBe(true); return response.json(); }

test('persisted mobile routine: blockers, immutable version, revision, review and creation retries', async ({ request }) => {
  test.setTimeout(120_000);
  const data = localTestData();
  try {
    const auth = await ok(await request.post(`${API}/auth/register`, { data: { firmName: data.firmName, firstName: 'Owner', lastName: 'Routine', email: data.email, password: data.password } }));
    const ownerHeaders = { Authorization: `Bearer ${auth.accessToken}` };
    const catalog = await ok(await request.get(`${API}/practice-setup/playbooks`, { headers: ownerHeaders }));
    const officeRoutines = catalog.filter((release: { templateKey?: string }) => release.templateKey?.startsWith('OFFICE_'));
    expect(officeRoutines).toHaveLength(5);
    for (const release of officeRoutines) {
      expect(release.steps[0].routine.sourceTemplate).toBeTruthy();
      expect(release.steps[0].routine.exampleOutput).toContain('สมมติ');
      expect(release.steps[0].routine.missingDocuments).toContain('ติดอะไร');
    }
    const owner = await data.db.user.findUniqueOrThrow({ where: { id: auth.user.id } });
    const users = await Promise.all(['ASSISTANT', 'LAWYER', 'SENIOR_LAWYER'].map(role => data.db.user.create({ data: {
      email: `${data.tag}-${role.toLowerCase()}@example.test`, firstName: role, lastName: 'Routine', passwordHash: owner.passwordHash, role: 'LAWYER',
      firmMembers: { create: { firmId: auth.user.firmId, role: role as 'ASSISTANT' | 'LAWYER' | 'SENIOR_LAWYER' } },
    } })));
    const login = async (email: string) => ({ Authorization: `Bearer ${(await ok(await request.post(`${API}/auth/login`, { data: { email, password: data.password } }))).accessToken}` });
    const workerHeaders = await login(users[0].email), lawyerHeaders = await login(users[1].email), seniorHeaders = await login(users[2].email);
    const legalCase = await data.db.case.create({ data: { firmId: auth.user.firmId, ownRef: data.tag, title: 'Routine fixture', leadLawyerId: owner.id, folderId: data.tag } });
    const definition = { name: `Routine ${data.tag}`, steps: [{ title: 'ตรวจและส่ง PDF', instructions: 'เปิดต้นฉบับในแฟ้ม แนบผลงาน แล้วตรวจทุกหน้าก่อนส่ง', primaryRole: 'ASSISTANT',
      routine: { expectedOutput: 'PDF ที่อ่านชัดตามต้นฉบับ', checks: ['ตรวจเลขคดี', 'แนบและตรวจชื่อไฟล์', 'เปิดตรวจทุกหน้า'], attachment: 'PDF', sourceHint: 'ต้นฉบับในแฟ้มคดี', exampleFilename: 'เลขคดี-เอกสาร.pdf', sourceTemplate: 'เลขคดี: [ข้อมูลจริง]', exampleOutput: 'ตัวอย่างสมมติ DEMO-001', missingDocuments: 'ระบุเอกสารขาดในช่องติดอะไรและแจ้งผู้ดูแลงาน' } }] };
    const release = await ok(await request.post(`${API}/practice-setup/playbooks`, { headers: ownerHeaders, data: definition }));
    const applied = await ok(await request.post(`${API}/practice-setup/cases/${legalCase.id}/apply`, { headers: ownerHeaders, data: { releaseId: release.id } }));
    const repeated = await ok(await request.post(`${API}/practice-setup/cases/${legalCase.id}/apply`, { headers: ownerHeaders, data: { releaseId: release.id } }));
    expect(repeated.id).toBe(applied.id);
    const id = applied.taskIds[0], detailPath = `${API}/tasks/${id}`, workflow = `${API}/cases/${legalCase.id}/tasks/${id}`;
    // Keep the request helper asynchronous so every read verifies what the API persisted.
    const detail = async () => ok(await request.get(detailPath, { headers: workerHeaders }));
    let task = await detail();
    expect(task.assigneeId).toBe(users[0].id); expect(task.reviewerId).toBe(owner.id); expect(task.requiresReview).toBe(true);
    expect(task.routine.version).toBe(1);
    expect(task.routine.sourceTemplate).toBe(definition.steps[0].routine.sourceTemplate);
    expect(task.routine.exampleOutput).toBe(definition.steps[0].routine.exampleOutput);
    expect(task.routine.missingDocuments).toBe(definition.steps[0].routine.missingDocuments);
    expect((await request.post(`${API}/practice-setup/playbooks`, { headers: ownerHeaders, data: { ...definition,
      steps: [{ ...definition.steps[0], routine: { ...definition.steps[0].routine, exampleOutput: 'x'.repeat(6001) } }],
    } })).status()).toBe(400);
    await ok(await request.post(`${API}/practice-setup/playbooks`, { headers: ownerHeaders, data: { ...definition, steps: [{ ...definition.steps[0], routine: { ...definition.steps[0].routine, expectedOutput: 'รุ่นใหม่' } }] } }));
    expect((await detail()).routine.expectedOutput).toBe(definition.steps[0].routine.expectedOutput);
    const progress = (headers: Record<string, string>, checks: number[], updatedAt: string) => request.post(`${detailPath}/routine-progress`, { headers, data: { expectedUpdatedAt: updatedAt, completedChecks: checks } });
    expect((await progress(workerHeaders, [0], task.updatedAt)).status()).toBe(403);
    await ok(await request.post(`${detailPath}/acknowledge`, { headers: workerHeaders })); task = await detail();
    expect((await progress(lawyerHeaders, [0], task.updatedAt)).status()).toBe(403);
    expect((await progress(workerHeaders, [8], task.updatedAt)).status()).toBe(400);
    const oldVersion = task.updatedAt;
    task = await ok(await progress(workerHeaders, [0], oldVersion));
    expect((await progress(workerHeaders, [0, 1], oldVersion)).status()).toBe(409);
    task = await ok(await progress(workerHeaders, [0, 1, 2], task.updatedAt));
    expect((await request.patch(`${workflow}/handoff`, { headers: workerHeaders, data: {} })).status()).toBe(400);
    // One blank PDF page for attachment transport; checklist quality is a human attestation.
    const bytes = Buffer.from('JVBERi0xLjcKJYGBgYEKCjUgMCBvYmoKPDwKL0ZpbHRlciAvRmxhdGVEZWNvZGUKL1R5cGUgL09ialN0bQovTiA0Ci9GaXJzdCAyMAovTGVuZ3RoIDI2OAo+PgpzdHJlYW0KeJzVkslqwzAQhu96ijm2l2i0WJaLMaReLqUQQk8NPYhYBEOJghdo374jK23pofRcxI+W+UbbPwIQJGgNCnILGjIloSwZf3q/eOA7d/IT4w9DP8GBogh7eGG8Dst5BsGqin2ztZvdazixlAQiwp/Ebgz9cvQjlF3bdYg5IhpNMoiyob4mFSRJc4pJS2NSrq+itVwhqi3FuiSTp5wYX9nsmt9ST6yJTJNYbdP869x4Vpv2kH/dp6gYfwx942YPN82dRGkELQujhCqeb+k7Ru/m8H8ft95/COdfX/jD52hvNHn0sQZWl/neT2EZj2Q7cVX8L98P7j68UdUgtazINtKC1WJjC6ogQj4AkXSPGwplbmRzdHJlYW0KZW5kb2JqCgo2IDAgb2JqCjw8Ci9TaXplIDcKL1Jvb3QgMiAwIFIKL0luZm8gMyAwIFIKL0ZpbHRlciAvRmxhdGVEZWNvZGUKL1R5cGUgL1hSZWYKL0xlbmd0aCAzNAovVyBbIDEgMiAyIF0KL0luZGV4IFsgMCA3IF0KPj4Kc3RyZWFtCnicFcQxDgAgCASwHsbdN/txCB2K7nLZstV24pF8BkOhArYKZW5kc3RyZWFtCmVuZG9iagoKc3RhcnR4cmVmCjM4NgolJUVPRg==', 'base64');
    await ok(await request.post(`${detailPath}/attachments`, { headers: workerHeaders, multipart: { file: { name: 'ผลที่ตรวจแล้ว.pdf', mimeType: 'application/pdf', buffer: bytes } } }));
    await ok(await request.post(`${detailPath}/daily-update`, { headers: workerHeaders, data: { completed: 'ตรวจต้นฉบับ', remaining: 'รอหน้าท้าย', blocker: 'เอกสารหน้าท้ายขาด' } }));
    const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Bangkok' }).format(new Date());
    const board = await ok(await request.get(`${API}/operations/daily?date=${today}`, { headers: ownerHeaders }));
    expect(board.tasks.find((t: { id: string }) => t.id === id).blocker).toBe('เอกสารหน้าท้ายขาด');
    for (const headers of [workerHeaders, lawyerHeaders, seniorHeaders]) expect((await request.get(`${API}/operations/daily?date=${today}`, { headers })).status()).toBe(403);
    expect((await request.patch(`${workflow}/handoff`, { headers: workerHeaders, data: {} })).status()).toBe(400);
    await ok(await request.post(`${detailPath}/daily-update`, { headers: workerHeaders, data: { completed: 'ตรวจทุกหน้าครบแล้ว', remaining: 'รอตรวจผลงาน', blocker: '' } }));
    expect((await request.patch(workflow, { headers: ownerHeaders, data: { requiresReview: false } })).status()).toBe(400);
    expect((await request.patch(workflow, { headers: workerHeaders, data: { description: 'เปลี่ยนวิธีทำเอง' } })).status()).toBe(400);
    await ok(await request.patch(`${workflow}/handoff`, { headers: workerHeaders, data: {} }));
    expect((await ok(await request.get(`${API}/todos?view=mine`, { headers: workerHeaders }))).some((t: { id: string }) => t.id === id)).toBe(true);
    expect((await detail()).status).toBe('PENDING_REVIEW');
    const unrelated = await data.db.task.create({ data: { caseId: legalCase.id, title: 'งานคนอื่นในคดีเดียวกัน', assigneeId: owner.id, createdById: owner.id } });
    expect((await request.get(`${API}/tasks/${unrelated.id}`, { headers: workerHeaders })).status()).toBe(403);
    expect((await request.post(`${workflow}/accept`, { headers: workerHeaders, data: {} })).status()).toBe(403);
    await ok(await request.post(`${workflow}/reject`, { headers: ownerHeaders, data: { reason: 'แก้ชื่อไฟล์แล้วตรวจใหม่' } }));
    task = await detail(); expect(task.routineCompletedChecks).toEqual([]); expect(task.status).toBe('NEEDS_REVISION');
    expect((await request.patch(`${workflow}/handoff`, { headers: workerHeaders, data: {} })).status()).toBe(400);
    await ok(await progress(workerHeaders, [0, 1, 2], task.updatedAt));
    await ok(await request.patch(`${workflow}/handoff`, { headers: workerHeaders, data: {} }));
    await ok(await request.post(`${workflow}/accept`, { headers: ownerHeaders, data: {} }));
    expect((await detail()).status).toBe('DONE');

    const newBody = { title: 'งานทั่วไปชื่อเดียว', assigneeId: owner.id, createRequestId: `retry-${data.tag}` };
    const results = await Promise.all([1, 2].map(async () => ok(await request.post(`${API}/todos`, { headers: ownerHeaders, data: newBody }))));
    expect(results[0].id).toBe(results[1].id); expect(results[0].routine).toBeNull(); expect(results[0].dueDate).toBeNull();
    expect(await data.db.task.count({ where: { createRequestId: newBody.createRequestId } })).toBe(1);
    const assigned = await ok(await request.post(`${API}/todos`, { headers: ownerHeaders, data: { title: 'งานประจำมอบหมายใหม่', assigneeId: users[1].id, requiresReview: true, reviewerId: owner.id, routineSource: { releaseId: release.id, stepIndex: 0 } } }));
    expect(assigned.routine.releaseId).toBe(release.id); expect(assigned.reviewerId).toBe(owner.id);
    expect((await request.patch(`${API}/todos/${assigned.id}/handoff`, { headers: lawyerHeaders, data: { reviewerId: owner.id } })).status()).toBe(400);
    await ok(await request.post(`${API}/tasks/${assigned.id}/acknowledge`, { headers: lawyerHeaders }));
    const standalone = await ok(await request.get(`${API}/tasks/${assigned.id}`, { headers: lawyerHeaders }));
    await ok(await request.post(`${API}/tasks/${assigned.id}/routine-progress`, { headers: lawyerHeaders, data: { expectedUpdatedAt: standalone.updatedAt, completedChecks: [0, 1, 2] } }));
    await ok(await request.post(`${API}/tasks/${assigned.id}/attachments`, { headers: lawyerHeaders, multipart: { file: { name: 'งานสำนักงาน.pdf', mimeType: 'application/pdf', buffer: bytes } } }));
    await ok(await request.patch(`${API}/todos/${assigned.id}/handoff`, { headers: lawyerHeaders, data: { reviewerId: owner.id } }));
    await ok(await request.post(`${API}/todos/${assigned.id}/reject`, { headers: ownerHeaders, data: { reason: 'ตรวจอีกครั้ง' } }));
    const revised = await ok(await request.get(`${API}/tasks/${assigned.id}`, { headers: lawyerHeaders }));
    expect(revised.routineCompletedChecks).toEqual([]);
    await ok(await request.post(`${API}/tasks/${assigned.id}/routine-progress`, { headers: lawyerHeaders, data: { expectedUpdatedAt: revised.updatedAt, completedChecks: [0, 1, 2] } }));
    await ok(await request.patch(`${API}/todos/${assigned.id}/handoff`, { headers: lawyerHeaders, data: { reviewerId: owner.id } }));
    await ok(await request.post(`${API}/todos/${assigned.id}/accept`, { headers: ownerHeaders, data: {} }));
    expect((await ok(await request.get(`${API}/tasks/${assigned.id}`, { headers: lawyerHeaders }))).status).toBe('DONE');
    const staged = await ok(await request.post(`${API}/practice-setup/playbooks`, { headers: ownerHeaders, data: { ...definition, name: `Stage ${data.tag}`, steps: [{ ...definition.steps[0], stage: 'INTAKE_REVIEW' }] } }));
    const stageResult = await ok(await request.post(`${API}/practice-setup/cases/${legalCase.id}/stage-tasks`, { headers: ownerHeaders, data: { stage: 'INTAKE_REVIEW', tasks: [{ title: 'งานจากขั้นตอน', assigneeId: users[0].id, routineSource: { releaseId: staged.id, stepIndex: 0 } }] } }));
    const stageTask = await data.db.task.findUniqueOrThrow({ where: { id: stageResult.taskIds[0] } });
    expect(stageTask.routine).not.toBeNull(); expect(stageTask.parentId).not.toBeNull();
    expect((await ok(await request.get(`${API}/todos?view=mine`, { headers: workerHeaders }))).some((t: { id: string }) => t.id === stageTask.id)).toBe(true);
  } finally { await data.cleanup(); }
});
