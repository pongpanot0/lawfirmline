import { test, expect, APIResponse } from '@playwright/test';
import { localTestData } from '../helpers/test-data';

const API = process.env.E2E_API_URL ?? 'http://localhost:3001';
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(API).hostname)) throw new Error('Owner office E2E requires a local API');
async function ok(response: APIResponse) { expect(response.ok(), await response.text()).toBe(true); return response.json(); }

test('Owner manages decisions, weekly reassignment and collections using separate money ledgers', async ({ request }) => {
  const data = localTestData();
  try {
    const auth = await ok(await request.post(`${API}/auth/register`, { data: { firmName: data.firmName, firstName: 'Owner', lastName: 'Office', email: data.email, password: data.password } }));
    const headers = { Authorization: `Bearer ${auth.accessToken}` }, firmId = auth.user.firmId;
    const owner = await data.db.user.findUniqueOrThrow({ where: { id: auth.user.id } });
    const worker = await data.db.user.create({ data: { email: `${data.tag}-worker@example.test`, firstName: 'Worker', lastName: 'Office', passwordHash: owner.passwordHash, role: 'LAWYER', firmMembers: { create: { firmId, role: 'ASSISTANT' } } } });
    const senior = await data.db.user.create({ data: { email: `${data.tag}-senior@example.test`, firstName: 'Senior', lastName: 'Office', passwordHash: owner.passwordHash, role: 'ADMIN', firmMembers: { create: { firmId, role: 'SENIOR_LAWYER' } } } });
    const login = await ok(await request.post(`${API}/auth/login`, { data: { email: worker.email, password: data.password } }));
    const workerHeaders = { Authorization: `Bearer ${login.accessToken}` };
    const seniorLogin = await ok(await request.post(`${API}/auth/login`, { data: { email: senior.email, password: data.password } }));
    const seniorHeaders = { Authorization: `Bearer ${seniorLogin.accessToken}` };
    const foreign = await ok(await request.post(`${API}/auth/register`, { data: { firmName: `${data.firmName} Other`, firstName: 'Other', lastName: 'Office', email: `${data.tag}-other@example.test`, password: data.password } }));
    const foreignHeaders = { Authorization: `Bearer ${foreign.accessToken}` };
    const legalCase = await data.db.case.create({ data: { firmId, ownRef: data.tag, folderId: data.tag, title: 'Owner local fixture', clientName: 'ลูกความทดสอบ', leadLawyerId: owner.id } });
    const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10), month = today.slice(0, 7);
    const dateOnly = new Date(`${today}T00:00:00Z`);
    const tomorrow = new Date(dateOnly.getTime() + 86400000).toISOString().slice(0, 10);

    const work = await ok(await request.post(`${API}/cases/${legalCase.id}/tasks`, { headers, data: { title: 'งานที่ต้องย้าย', assigneeId: worker.id, dueDate: `${today}T23:59:59+07:00`, size: 'L' } }));
    await data.db.calendarEvent.create({ data: { caseId: legalCase.id, title: 'นัดศาลช่วงต้นวัน', type: 'COURT_DATE', startAt: new Date(`${today}T00:30:00+07:00`), assigneeId: worker.id, assignees: { create: { userId: worker.id } } } });
    await data.db.calendarEvent.create({ data: { caseId: legalCase.id, title: 'นัดศาลวันถัดไป', type: 'COURT_DATE', startAt: new Date(`${tomorrow}T00:30:00+07:00`), assigneeId: worker.id, assignees: { create: { userId: worker.id } } } });
    const leave = await data.db.leaveRequest.create({ data: { firmId, userId: worker.id, type: 'PERSONAL', startDate: dateOnly, endDate: dateOnly } });
    const oldLeave = await data.db.leaveRequest.create({ data: { firmId, userId: worker.id, type: 'VACATION', startDate: new Date('2025-01-01'), endDate: new Date('2025-01-01') } });
    const pending = await ok(await request.get(`${API}/leaves/pending`, { headers }));
    expect(pending.map((row: { id: string }) => row.id)).toEqual(expect.arrayContaining([leave.id, oldLeave.id]));
    expect(pending.find((row: { id: string }) => row.id === leave.id).courtConflicts).toHaveLength(1);
    expect((await request.get(`${API}/leaves/pending`, { headers: seniorHeaders })).status()).toBe(403);
    await ok(await request.patch(`${API}/leaves/${leave.id}/decision`, { headers, data: { decision: 'APPROVED' } }));
    expect((await request.patch(`${API}/leaves/${leave.id}/decision`, { headers, data: { decision: 'REJECTED' } })).status()).toBe(400);
    expect((await request.patch(`${API}/leaves/${oldLeave.id}/decision`, { headers: foreignHeaders, data: { decision: 'APPROVED' } })).status()).toBe(404);
    let radar = await ok(await request.get(`${API}/operations/radar?date=${today}`, { headers }));
    expect(radar.members.find((member: { userId: string }) => member.userId === worker.id).days[0]).toMatchObject({ taskCount: 1, points: 4, courtCount: 1, onLeave: true });
    await ok(await request.patch(`${API}/cases/${legalCase.id}/tasks/${work.id}/reassign`, { headers, data: { assigneeId: senior.id } }));
    radar = await ok(await request.get(`${API}/operations/radar?date=${today}`, { headers: seniorHeaders }));
    expect(radar.members.find((member: { userId: string }) => member.userId === worker.id).days[0].taskCount).toBe(0);
    expect(radar.members.find((member: { userId: string }) => member.userId === senior.id).days[0].taskCount).toBe(1);
    const hidden = await data.db.case.create({ data: { firmId, ownRef: `${data.tag}-hidden`, folderId: `${data.tag}-hidden`, title: 'ห้ามเปิดคดีนี้', leadLawyerId: owner.id } });
    await data.db.task.create({ data: { caseId: hidden.id, firmId, createdById: owner.id, assigneeId: worker.id, title: 'ห้ามเปิดชื่องานนี้' } });
    const scopedPerson = await ok(await request.get(`${API}/operations/people/${worker.id}?from=${today}`, { headers: seniorHeaders }));
    expect(scopedPerson.tasks.some((task: { title: string }) => task.title === 'ห้ามเปิดชื่องานนี้')).toBe(false);

    const review = await ok(await request.post(`${API}/todos`, { headers, data: { title: 'รอ Owner ตรวจ', assigneeId: worker.id, requiresReview: true, reviewerId: owner.id } }));
    await ok(await request.post(`${API}/tasks/${review.id}/acknowledge`, { headers: workerHeaders }));
    await ok(await request.patch(`${API}/todos/${review.id}/handoff`, { headers: workerHeaders, data: { reviewerId: owner.id } }));
    const reviewQueue = await ok(await request.get(`${API}/todos?view=review`, { headers }));
    expect(reviewQueue.some((row: { id: string }) => row.id === review.id)).toBe(true);

    const draftExpense = await ok(await request.post(`${API}/expenses`, { headers: workerHeaders, data: { amount: 250, description: 'เบิกทดสอบ', status: 'DRAFT' } }));
    const claim = await ok(await request.post(`${API}/expenses/submit`, { headers: workerHeaders, data: { expenseIds: [draftExpense.id] } }));
    const claimDetail = await ok(await request.get(`${API}/expense-claims/${claim.id}`, { headers }));
    expect(claimDetail.expenses[0].description).toBe('เบิกทดสอบ');
    await ok(await request.patch(`${API}/expense-claims/${claim.id}/status`, { headers, data: { status: 'APPROVED' } }));

    const invoice = await data.db.invoice.create({ data: { firmId, caseId: legalCase.id, createdById: owner.id, invoiceNumber: `${data.tag}-sent`, status: 'SENT', totalAmount: 5000, issuedAt: new Date(), dueAt: new Date('2026-01-01'), lineItems: { create: { description: 'ค่าดำเนินคดี', quantity: 1, unitPrice: 5000, amount: 5000 } } } });
    await data.db.invoicePayment.create({ data: { firmId, invoiceId: invoice.id, recordedById: owner.id, amount: 1000, receivedAt: dateOnly } });
    await data.db.invoice.create({ data: { firmId, createdById: owner.id, invoiceNumber: `${data.tag}-legacy-paid`, status: 'PAID', totalAmount: 900, issuedAt: new Date() } });
    await data.db.invoice.create({ data: { firmId, createdById: owner.id, invoiceNumber: `${data.tag}-draft`, totalAmount: 200 } });
    const time = await data.db.timeEntry.create({ data: { caseId: legalCase.id, userId: worker.id, hours: 2, rate: 1000, description: 'งานที่ยังไม่วางบิล' } });
    const cost = await data.db.expense.create({ data: { caseId: legalCase.id, userId: worker.id, amount: 300, status: 'APPROVED', description: 'ค่าใช้จ่ายคดี' } });
    await data.db.expense.create({ data: { userId: worker.id, amount: 500, status: 'APPROVED', billable: false, description: 'ค่าใช้จ่ายสำนักงาน' } });
    let money = await ok(await request.get(`${API}/invoices/owner-worklist?month=${month}`, { headers }));
    expect(money.totals).toEqual({ received: 1000, billed: 5900, unbilled: 2500, payable: 1050, receivable: 4000 });
    expect(money.receipts).toHaveLength(1); expect(money.unbilled[0].timeEntryIds).toContain(time.id);
    expect(money.payable.some((row: { case: unknown }) => row.case === null)).toBe(true);
    const officeExpense = money.payable.find((row: { case: unknown; description: string }) => row.case === null && row.description === 'ค่าใช้จ่ายสำนักงาน');
    const officeClaim = await data.db.expenseClaim.create({ data: { firmId, submittedById: worker.id, status: 'APPROVED' } });
    await data.db.expense.update({ where: { id: officeExpense.id }, data: { claimId: officeClaim.id } });
    await data.db.firmMember.create({ data: { firmId: foreign.user.firmId, userId: worker.id, role: 'ASSISTANT' } });
    const foreignClaim = await data.db.expenseClaim.create({ data: { firmId: foreign.user.firmId, submittedById: worker.id, status: 'APPROVED' } });
    await data.db.expense.create({ data: { userId: worker.id, claimId: foreignClaim.id, amount: 9000, status: 'APPROVED', billable: false, description: 'ค่าใช้จ่ายของสำนักงานอื่น' } });
    await data.db.expense.create({ data: { userId: worker.id, amount: 8000, status: 'APPROVED', billable: false, description: 'รายการเก่าที่ยังระบุสำนักงานไม่ได้' } });
    money = await ok(await request.get(`${API}/invoices/owner-worklist?month=${month}`, { headers }));
    expect(money.totals.payable).toBe(1050);
    expect(money.payable.some((row: { description: string }) => row.description.includes('สำนักงานอื่น') || row.description.includes('ระบุสำนักงานไม่ได้'))).toBe(false);
    for (const route of ['/invoices/owner-worklist', '/invoices/receivables', '/invoices', '/finance/summary', `/invoices/${invoice.id}/collection`, `/invoices/${invoice.id}/payments`, `/invoices/${invoice.id}/print-data`]) {
      expect((await request.get(`${API}${route}`, { headers: seniorHeaders })).status(), route).toBe(403);
    }
    expect((await request.get(`${API}/invoices/${invoice.id}/collection`, { headers: foreignHeaders })).status()).toBe(404);
    expect((await request.get(`${API}/invoices/owner-worklist?month=2026-13`, { headers })).status()).toBe(400);
    const original = await ok(await request.get(`${API}/invoices/${invoice.id}/collection`, { headers }));
    expect((await request.patch(`${API}/invoices/${invoice.id}/follow-up`, { headers, data: { updatedAt: original.updatedAt, ownerId: foreign.user.id } })).status()).toBe(400);
    const follow = await ok(await request.patch(`${API}/invoices/${invoice.id}/follow-up`, { headers, data: { updatedAt: original.updatedAt, ownerId: worker.id, nextAt: today, note: 'รอผู้จ่ายตรวจเอกสาร' } }));
    expect(follow.collectionOwner.id).toBe(worker.id); expect(follow.collectionNote).toBe('รอผู้จ่ายตรวจเอกสาร');
    expect((await request.patch(`${API}/invoices/${invoice.id}/follow-up`, { headers, data: { updatedAt: original.updatedAt, note: 'ร่างเก่า' } })).status()).toBe(409);

    const payment = { amount: 600, receivedAt: today, createRequestId: `${data.tag}-payment` };
    const repeated = await Promise.all([1, 2].map(() => request.post(`${API}/invoices/${invoice.id}/payments`, { headers, data: payment })));
    const records = await Promise.all(repeated.map(ok));
    expect(records[0].payment.id).toBe(records[1].payment.id);
    expect(await data.db.invoicePayment.count({ where: { invoiceId: invoice.id, createRequestId: payment.createRequestId } })).toBe(1);
    expect((await request.post(`${API}/invoices/${invoice.id}/payments`, { headers, data: { ...payment, amount: 601 } })).status()).toBe(409);
    expect((await request.post(`${API}/invoices/${invoice.id}/payments`, { headers, data: { amount: 4000, receivedAt: today } })).status()).toBe(400);
    expect((await request.post(`${API}/invoices/${invoice.id}/payments`, { headers, data: { amount: 1, receivedAt: tomorrow } })).status()).toBe(400);
    expect((await request.post(`${API}/invoices/${invoice.id}/payments`, { headers: seniorHeaders, data: payment })).status()).toBe(403);
    expect((await request.post(`${API}/invoices/${invoice.id}/payments`, { headers: foreignHeaders, data: payment })).status()).toBe(404);
    expect((await request.post(`${API}/invoices/${invoice.id}/payments`, { headers, data: { amount: 1, receivedAt: '2026-02-30' } })).status()).toBe(400);
    await ok(await request.patch(`${API}/expense-claims/${claim.id}/status`, { headers, data: { status: 'PAID' } }));
    money = await ok(await request.get(`${API}/invoices/owner-worklist?month=${month}`, { headers }));
    expect(money.totals.received).toBe(1600); expect(money.totals.receivable).toBe(3400); expect(money.totals.payable).toBe(800);

    const bodies = [1, 2].map(() => request.post(`${API}/cases/${legalCase.id}/billing/invoices`, { headers, data: { timeEntryIds: [time.id], expenseIds: [cost.id] } }));
    const creates = await Promise.all(bodies);
    expect(creates.filter(response => response.ok())).toHaveLength(1);
    const invoices = await ok(creates.find(response => response.ok())!);
    expect(invoices[0].status).toBe('DRAFT'); expect(invoices[0].totalAmount).toBe(2300);
    money = await ok(await request.get(`${API}/invoices/owner-worklist?month=${month}`, { headers }));
    expect(money.unbilled).toHaveLength(0); expect(money.totals.unbilled).toBe(2500);
    const issues = await Promise.all([1, 2].map(() => request.patch(`${API}/invoices/${invoices[0].id}/send`, { headers })));
    expect(issues.filter(response => response.ok())).toHaveLength(1);
    expect([400, 409]).toContain(issues.find(response => !response.ok())!.status());
    money = await ok(await request.get(`${API}/invoices/owner-worklist?month=${month}`, { headers }));
    expect(money.totals.unbilled).toBe(200); expect(money.totals.billed).toBe(8200); expect(money.totals.received).toBe(1600);
  } finally { await data.cleanup(); }
});
