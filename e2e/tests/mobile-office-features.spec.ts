import { test, expect, APIResponse } from '@playwright/test';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { localTestData } from '../helpers/test-data';

const API = process.env.E2E_API_URL ?? 'http://localhost:3001';
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(API).hostname)) throw new Error('Office feature E2E requires a local API');
async function ok(response: APIResponse) { expect(response.ok(), await response.text()).toBe(true); return response.json(); }

test('mobile office features: seven days, reviewed document, recurring review, external requests and delegated blocker', async ({ request }) => {
  test.setTimeout(120_000);
  const data = localTestData();
  let caseId = '';
  try {
    if (process.env.S3_BUCKET) throw new Error('Office feature E2E requires local file storage');
    const auth = await ok(await request.post(`${API}/auth/register`, { data: { firmName: data.firmName, firstName: 'Owner', lastName: 'Office', email: data.email, password: data.password } }));
    const ownerHeaders = { Authorization: `Bearer ${auth.accessToken}` };
    const owner = await data.db.user.findUniqueOrThrow({ where: { id: auth.user.id } });
    const worker = await data.db.user.create({ data: { email: `${data.tag}-assistant@example.test`, firstName: 'Assistant', lastName: 'Office', passwordHash: owner.passwordHash, role: 'LAWYER', firmMembers: { create: { firmId: auth.user.firmId, role: 'ASSISTANT' } } } });
    const login = await ok(await request.post(`${API}/auth/login`, { data: { email: worker.email, password: data.password } }));
    const workerHeaders = { Authorization: `Bearer ${login.accessToken}` };
    const outsider = await ok(await request.post(`${API}/auth/register`, { data: { firmName: `${data.firmName} Other`, firstName: 'Other', lastName: 'Office', email: `${data.tag}-other@example.test`, password: data.password } }));
    const foreignHeaders = { Authorization: `Bearer ${outsider.accessToken}` };
    const intake = await data.db.intake.create({ data: { firmId: auth.user.firmId, receivedById: owner.id, title: 'รายการจากขั้นรับเรื่อง', status: 'CONVERTED' } });
    const legalCase = await data.db.case.create({ data: { firmId: auth.user.firmId, ownRef: data.tag, folderId: data.tag, title: 'Office fixture', clientName: 'ลูกความทดสอบ', leadLawyerId: owner.id, intakeId: intake.id } });
    caseId = legalCase.id;
    const hiddenCase = await data.db.case.create({ data: { firmId: auth.user.firmId, ownRef: `${data.tag}-hidden`, folderId: `${data.tag}-hidden`, title: 'ไม่ได้มอบหมายให้ผู้ช่วย', leadLawyerId: owner.id } });
    const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
    const base = `${API}/cases/${caseId}`;
    const task = await ok(await request.post(`${base}/tasks`, { headers: ownerHeaders, data: { title: 'งานรอสัญญา', assigneeId: worker.id, dueDate: `${today}T23:59:59+07:00` } }));
    await ok(await request.post(`${API}/tasks/${task.id}/acknowledge`, { headers: workerHeaders }));

    await data.db.leaveRequest.create({ data: { firmId: auth.user.firmId, userId: worker.id, type: 'SICK', status: 'APPROVED', startDate: new Date(`${today}T00:00:00Z`), endDate: new Date(`${today}T00:00:00Z`) } });
    await data.db.calendarEvent.create({ data: { caseId, title: 'นัดศาลทดสอบ', startAt: new Date(`${today}T10:00:00+07:00`), assigneeId: worker.id, courtName: 'ศาลทดสอบ' } });
    const radar = await ok(await request.get(`${API}/operations/radar?date=${today}`, { headers: ownerHeaders }));
    expect(radar.days).toHaveLength(7);
    const member = radar.members.find((p: { userId: string }) => p.userId === worker.id);
    expect(member.days[0]).toMatchObject({ onLeave: true, taskCount: 1, eventCount: 1 });
    const foreignRadar = await ok(await request.get(`${API}/operations/radar?date=${today}`, { headers: foreignHeaders }));
    expect(foreignRadar.members.some((p: { userId: string }) => p.userId === worker.id)).toBe(false);

    const template = await ok(await request.post(`${API}/document-templates`, { headers: ownerHeaders, data: { name: 'หนังสือทดสอบ', templateBody: 'ลูกความ {{clientName}}\nเรียน {{courtName}}\n{{ownRef}}' } }));
    const rendered = await ok(await request.get(`${base}/document-templates/${template.id}/render`, { headers: workerHeaders }));
    expect(rendered.content).toContain('ลูกความทดสอบ'); expect(rendered.missingFields).toEqual(['courtName']);
    expect(rendered.content).toContain('{{courtName}}');
    expect((await request.post(`${base}/document-templates/${template.id}/generate`, { headers: workerHeaders, data: { content: rendered.content } })).status()).toBe(400);
    expect((await request.post(`${base}/document-templates/${template.id}/generate`, { headers: workerHeaders, data: { content: null } })).status()).toBe(400);
    const generated = await ok(await request.post(`${base}/document-templates/${template.id}/generate`, { headers: workerHeaders, data: { content: rendered.content.replace('{{courtName}}', 'ศาลที่ตรวจแล้ว') } }));
    const document = await data.db.document.findUniqueOrThrow({ where: { id: generated.documentId }, include: { versions: true } });
    expect(document.visibleToClient).toBe(false); expect(document.versions[0].status).toBe('DRAFT');
    const download = await request.get(`${base}/documents/${generated.documentId}/download`, { headers: workerHeaders });
    expect(download.ok()).toBe(true); expect((await download.body()).subarray(0, 2).toString()).toBe('PK');
    expect((await request.get(`${base}/document-templates/${template.id}/render`, { headers: foreignHeaders })).status()).toBe(403);

    const converted = await data.db.intakeDocumentRequest.create({ data: { intakeId: intake.id, createdById: owner.id, name: 'บัตรจากขั้นรับเรื่อง', dueDate: new Date() } });
    const waiting = await ok(await request.post(`${base}/document-requests`, { headers: workerHeaders, data: { name: 'สัญญาฉบับจริง', requestedFrom: 'ฝ่ายกฎหมายลูกความ', dueDate: `${today}T23:59:59+07:00` } }));
    const allRequests = await ok(await request.get(`${API}/document-requests`, { headers: workerHeaders }));
    expect(allRequests.map((row: { id: string }) => row.id)).toEqual(expect.arrayContaining([converted.id, waiting.id]));
    expect(allRequests.every((row: { case: { id: string } }) => row.case.id === caseId)).toBe(true);
    expect((await request.patch(`${API}/cases/${hiddenCase.id}/document-requests/${waiting.id}`, { headers: ownerHeaders, data: { status: 'RECEIVED' } })).status()).toBe(404);
    expect((await request.get(`${base}/document-requests`, { headers: foreignHeaders })).status()).toBe(404);
    const received = await ok(await request.patch(`${base}/document-requests/${waiting.id}`, { headers: workerHeaders, data: { status: 'RECEIVED', documentId: generated.documentId } }));
    expect(received.receivedAt).toBeTruthy();
    const reopened = await ok(await request.patch(`${base}/document-requests/${waiting.id}`, { headers: workerHeaders, data: { status: 'REQUESTED', dueDate: null } }));
    expect(reopened.receivedAt).toBeNull(); expect(reopened.dueDate).toBeNull();

    const recurring = await ok(await request.post(`${API}/todos`, { headers: ownerHeaders, data: { title: 'ตรวจแฟ้มทุก 7 วัน', assigneeId: worker.id, requiresReview: true, reviewerId: owner.id, recurrenceDays: 7 } }));
    expect((await request.patch(`${API}/todos/${recurring.id}`, { headers: foreignHeaders, data: { recurrenceDays: 1 } })).status()).toBe(404);
    expect((await request.patch(`${API}/todos/${recurring.id}`, { headers: workerHeaders, data: { recurrenceDays: 0 } })).status()).toBe(400);
    await ok(await request.post(`${API}/tasks/${recurring.id}/acknowledge`, { headers: workerHeaders }));
    await ok(await request.patch(`${API}/todos/${recurring.id}/handoff`, { headers: workerHeaders, data: { reviewerId: owner.id } }));
    const accepts = await Promise.all([1, 2].map(() => request.post(`${API}/todos/${recurring.id}/accept`, { headers: ownerHeaders, data: {} })));
    expect(accepts.some(response => response.ok())).toBe(true);
    const next = await data.db.task.findMany({ where: { createRequestId: `recurrence:${recurring.id}` } });
    expect(next).toHaveLength(1); expect(next[0]).toMatchObject({ assigneeId: worker.id, reviewerId: owner.id, requiresReview: true, status: 'TODO', recurrenceDays: 7 });
    await ok(await request.patch(`${API}/todos/${next[0].id}`, { headers: workerHeaders, data: { recurrenceDays: null } }));
    expect((await data.db.task.findUniqueOrThrow({ where: { id: next[0].id } })).recurrenceDays).toBeNull();

    await ok(await request.post(`${API}/tasks/${task.id}/daily-update`, { headers: workerHeaders, data: { completed: 'ตรวจแฟ้มแล้ว', remaining: 'รอสัญญา', blocker: 'ลูกความยังไม่ส่งสัญญา' } }));
    const detail = await ok(await request.get(`${API}/tasks/${task.id}`, { headers: workerHeaders }));
    const person = await ok(await request.get(`${API}/operations/people/${worker.id}?from=${today}`, { headers: ownerHeaders }));
    expect(person.tasks.find((item: { id: string }) => item.id === task.id).holdReason).toBe('ลูกความยังไม่ส่งสัญญา');
    const source = detail.comments.at(-1);
    const body = { sourceCommentId: source.id, latestCommentId: source.id, taskUpdatedAt: detail.updatedAt, quote: 'ลูกความยังไม่ส่งสัญญา', title: 'ช่วยตามสัญญา', description: 'ประสานลูกความให้ส่งสัญญา', assigneeId: owner.id, followUpDate: today };
    expect((await request.post(`${API}/tasks/${task.id}/blocker-follow-up`, { headers: workerHeaders, data: { ...body, quote: 'ข้อความที่ไม่เคยแจ้ง' } })).status()).toBe(400);
    expect((await request.post(`${API}/tasks/${task.id}/blocker-follow-up`, { headers: foreignHeaders, data: body })).status()).toBe(404);
    const resolution = await ok(await request.post(`${API}/tasks/${task.id}/blocker-follow-up`, { headers: workerHeaders, data: body }));
    const retry = await ok(await request.post(`${API}/tasks/${task.id}/blocker-follow-up`, { headers: workerHeaders, data: body }));
    expect(retry.id).toBe(resolution.id);
    expect(await data.db.task.count({ where: { followUpSourceCommentId: source.id } })).toBe(1);
    const linked = await ok(await request.get(`${API}/tasks/${task.id}`, { headers: workerHeaders }));
    expect(linked.blockedById).toBe(resolution.id); expect(linked.followUps[0].assignee.id).toBe(owner.id);
    expect((await request.patch(`${base}/tasks/${task.id}`, { headers: workerHeaders, data: { status: 'DONE' } })).status()).toBe(400);
    await ok(await request.patch(`${base}/tasks/${resolution.id}`, { headers: ownerHeaders, data: { status: 'DONE' } }));
    const resolved = await ok(await request.get(`${API}/tasks/${task.id}`, { headers: workerHeaders }));
    expect(resolved.followUps[0].status).toBe('DONE'); expect(resolved.status).not.toBe('DONE');
    await ok(await request.post(`${API}/tasks/${task.id}/daily-update`, { headers: workerHeaders, data: { completed: 'ได้รับสัญญาและตรวจแล้ว', remaining: 'ทำงานต่อ', blocker: '' } }));
    await ok(await request.patch(`${base}/tasks/${task.id}`, { headers: workerHeaders, data: { status: 'DONE' } }));
  } finally {
    if (caseId && !process.env.S3_BUCKET) {
      const root = path.resolve('apps/api', process.env.UPLOAD_DIR ?? 'uploads');
      await rm(path.join(root, 'cases', caseId), { recursive: true, force: true });
    }
    await data.cleanup();
  }
});
