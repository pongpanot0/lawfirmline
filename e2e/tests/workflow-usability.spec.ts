import { test, expect } from '@playwright/test';
import { localTestData } from '../helpers/test-data';

const API = process.env.E2E_API_URL ?? 'http://localhost:3001';

for (const width of [375, 1440]) {
  test(`client → case → SOP → assignment → revision and review at ${width}px`, async ({ page, request, browser }) => {
    test.setTimeout(180_000);
    const data = localTestData();
    const workerContext = await browser.newContext({ viewport: { width, height: 900 } });
    try {
      const registration = await request.post(`${API}/auth/register`, { data: {
        firmName: data.firmName, firstName: 'ผู้ตรวจ', lastName: 'สำนักงาน', email: data.email, password: data.password,
      } });
      expect(registration.status()).toBe(201);
      const auth = await registration.json();
      const headers = { Authorization: `Bearer ${auth.accessToken}` };
      const origin = `http://${auth.user.firmSlug}.localhost:3005`;
      const owner = await data.db.user.findUniqueOrThrow({ where: { id: auth.user.id } });
      const worker = await data.db.user.create({ data: {
        email: `${data.tag}-worker@example.test`, passwordHash: owner.passwordHash,
        firstName: 'ผู้ทำ', lastName: 'งาน', role: 'LAWYER',
        firmMembers: { create: { firmId: auth.user.firmId, role: 'LAWYER' } },
      } });
      const clientResponse = await request.post(`${API}/clients`, { headers, data: { name: `บริษัท ${data.tag}`, type: 'COMPANY', contacts: [{ name: `บริษัท ${data.tag}`, isPrimary: true }] } });
      expect(clientResponse.status(), await clientResponse.text()).toBe(201);
      const client = await clientResponse.json();
      const caseType = await data.db.caseType.findFirstOrThrow({ where: { firmId: auth.user.firmId, name: 'คดีความ' } });
      const sopResponse = await request.post(`${API}/practice-setup/playbooks`, { headers, data: {
        name: `ขั้นตอนรับเรื่อง ${data.tag}`, caseTypeId: caseType.id,
        steps: [{ title: 'ตรวจเอกสารต้นฉบับ', instructions: 'ตรวจเอกสารก่อนมอบหมาย' }, { title: 'สรุปประเด็นให้ลูกค้า', instructions: '' }],
      } });
      expect(sopResponse.status()).toBe(201);
      const sop = await sopResponse.json();
      await page.setViewportSize({ width, height: 900 });
      const ownerHash = new URLSearchParams({ access_token: auth.accessToken, refresh_token: auth.refreshToken, next: `/clients?id=${client.id}`, locale: 'th' });
      await page.goto(`${origin}/handoff#${ownerHash}`);
      await page.getByRole('link', { name: 'เปิด Case ใหม่', exact: true }).first().click();
      await expect(page.locator('#client-combobox')).toHaveValue(client.name);
      await page.locator('#case-type').selectOption(caseType.id);
      await expect(page.locator('#case-title')).toHaveValue(`${caseType.name} — ${client.name}`);
      await expect(page.locator('#new-case-playbook')).toHaveValue(sop.id);
      // A failed preview must leave the newly created case available for retry, with no hidden tasks.
      await page.route('**/practice-setup/cases/*/preview', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"โหลดรายการงานไม่สำเร็จ"}' }));
      await page.getByRole('button', { name: 'สร้างคดี', exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/cases/[0-9a-f-]+\\?tab=tasks&sop=${sop.id}`));
      const legalCase = await data.db.case.findFirstOrThrow({ where: { firmId: auth.user.firmId } });
      expect(legalCase.clientId).toBe(client.id);
      expect(await data.db.client.count({ where: { firmId: auth.user.firmId } })).toBe(1);
      await expect(page.getByRole('button', { name: 'ยืนยันเพิ่มงานตามรายการ', exact: true })).toBeDisabled();
      expect(await data.db.task.count({ where: { caseId: legalCase.id } })).toBe(0);
      await page.unroute('**/practice-setup/cases/*/preview');
      await page.getByRole('button', { name: 'ลองโหลดรายการงานอีกครั้ง', exact: true }).click();
      await expect(page.getByText('ตรวจเอกสารก่อนมอบหมาย', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'ยืนยันเพิ่มงานตามรายการ', exact: true }).click();
      await expect(page.getByRole('status').filter({ hasText: 'เพิ่มงานจาก SOP แล้ว' })).toBeVisible();
      expect(await data.db.task.count({ where: { caseId: legalCase.id } })).toBe(2);

      await page.getByRole('link', { name: 'เพิ่มงาน', exact: true }).click();
      const form = page.getByRole('dialog', { name: 'เพิ่มงาน', exact: true });
      await expect(form).toContainText(legalCase.title);
      await expect(form.locator('#case-task-priority')).toBeHidden();
      expect(await form.locator('input, select, textarea').evaluateAll(elements => elements.filter(el => !el.closest('details:not([open])') && el.getClientRects().length).length)).toBe(3);
      const taskTitle = `งานต้องส่งตรวจ ${data.tag}`;
      await form.locator('#case-task-title').fill(taskTitle);
      await form.locator('#case-task-assignee').selectOption(worker.id);
      await form.locator('#case-task-due').fill('2026-10-14');
      await form.locator('summary').click();
      await form.getByRole('checkbox', { name: 'ต้องให้ผู้ตรวจยืนยันก่อนปิดงาน', exact: true }).check();
      await expect(form.locator('#case-task-reviewer')).toHaveValue(auth.user.id);
      await form.locator('#case-task-reviewer').selectOption('');
      await form.locator('summary').click();
      await form.getByRole('button', { name: 'สร้าง', exact: true }).click();
      await expect(form.locator('#case-task-reviewer')).toBeVisible();
      expect(await form.locator('#case-task-reviewer').evaluate((el: HTMLSelectElement) => el.validity.valueMissing)).toBe(true);
      await form.locator('#case-task-reviewer').selectOption(auth.user.id);
      await form.locator('summary').click();
      await page.route('**/cases/*/tasks', route => route.request().method() === 'POST'
        ? route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"บันทึกงานไม่สำเร็จ ลองอีกครั้ง"}' }) : route.continue(), { times: 1 });
      await form.getByRole('button', { name: 'สร้าง', exact: true }).click();
      await expect(form.getByRole('alert')).toContainText('บันทึกงานไม่สำเร็จ');
      await expect(form.locator('#case-task-title')).toHaveValue(taskTitle);
      await form.getByRole('button', { name: 'สร้าง', exact: true }).click();
      await expect(form).toHaveCount(0);
      await expect(page.locator('#td-status')).toBeVisible(); // Saved work opens immediately.
      const task = await data.db.task.findFirstOrThrow({ where: { caseId: legalCase.id, title: taskTitle } });
      expect(task.assigneeId).toBe(worker.id); expect(task.reviewerId).toBe(auth.user.id); expect(task.requiresReview).toBe(true);
      expect(task.dueDate?.toISOString().slice(0, 10)).toBe('2026-10-14');
      expect(await data.db.task.count({ where: { caseId: legalCase.id } })).toBe(3);
      await expect(page.getByRole('button', { name: /^งานค้าง 3 รายการ/ })).toHaveCount(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

      const workerAuthResponse = await request.post(`${API}/auth/login`, { data: { email: worker.email, password: data.password } });
      expect(workerAuthResponse.ok()).toBe(true);
      const workerAuth = await workerAuthResponse.json();
      const workerPage = await workerContext.newPage();
      const workerHash = new URLSearchParams({ access_token: workerAuth.accessToken, refresh_token: workerAuth.refreshToken, next: '/todos', locale: 'th' });
      await workerPage.goto(`${origin}/handoff#${workerHash}`);
      await workerPage.locator('main').getByText(taskTitle, { exact: true }).click();
      await expect(workerPage.getByRole('button', { name: 'ตรวจผ่านและปิดงาน', exact: true })).toHaveCount(0);
      await workerPage.getByRole('button', { name: 'ยืนยันรับทราบงาน', exact: true }).click();
      await workerPage.getByRole('button', { name: 'ยืนยันว่าจะทำงานนี้วันนี้', exact: true }).click();
      await expect(workerPage.getByRole('textbox', { name: 'ทำถึงไหนแล้ว', exact: true })).toBeHidden();
      await workerPage.getByText('บันทึกความคืบหน้า / ขอความช่วยเหลือ', { exact: true }).click();
      await workerPage.getByRole('textbox', { name: 'ทำถึงไหนแล้ว', exact: true }).fill('ตรวจเอกสารครบทั้งชุด');
      await workerPage.getByRole('textbox', { name: 'เหลืออะไร', exact: true }).fill('รอผู้ตรวจยืนยัน');
      await workerPage.getByRole('button', { name: 'บันทึกความคืบหน้าวันนี้', exact: true }).click();
      await expect(workerPage.getByRole('status').filter({ hasText: 'บันทึกความคืบหน้าแล้ว' })).toBeVisible();
      await workerPage.getByRole('button', { name: 'ส่งผลงานให้ตรวจ', exact: true }).click();
      await expect.poll(async () => (await data.db.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe('PENDING_REVIEW');
      expect((await request.post(`${API}/cases/${legalCase.id}/tasks/${task.id}/accept`, { headers: { Authorization: `Bearer ${workerAuth.accessToken}` } })).status()).toBe(403);
      await workerPage.goto(`${origin}/todos`);
      await expect(workerPage.locator('main').getByText(taskTitle, { exact: true })).toBeVisible();
      await workerPage.locator('main').getByText(taskTitle, { exact: true }).click();

      await page.goto(`${origin}/todos`);
      await page.getByRole('button', { name: /^รอฉันตรวจ/ }).click();
      await page.locator('main').getByText(taskTitle, { exact: true }).click();
      await expect(page.locator('aside').last()).toContainText('ตรวจเอกสารครบทั้งชุด');
      const reject = page.getByRole('button', { name: 'ส่งกลับให้แก้ไข', exact: true });
      await expect(reject).toBeDisabled();
      await page.getByRole('textbox', { name: 'เหตุผลที่ให้แก้ไข', exact: true }).fill('ตรวจชื่อในเอกสารหน้าแรกอีกครั้ง');
      await reject.click();
      await expect.poll(async () => (await data.db.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe('NEEDS_REVISION');
      await workerPage.reload();
      await expect(workerPage.locator('#td-status')).toHaveValue('NEEDS_REVISION');
      await expect(workerPage.locator('aside').last()).toContainText('ตรวจชื่อในเอกสารหน้าแรกอีกครั้ง');
      await workerPage.getByRole('button', { name: 'ส่งผลงานให้ตรวจ', exact: true }).click();
      await expect.poll(async () => (await data.db.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe('PENDING_REVIEW');
      await page.reload();
      await page.getByRole('button', { name: 'ตรวจผ่านและปิดงาน', exact: true }).click();
      await expect.poll(async () => (await data.db.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe('DONE');
      await workerPage.goto(`${origin}/todos`);
      await workerPage.getByRole('button', { name: /^แสดงงานที่เสร็จแล้ว/ }).click();
      await expect(workerPage.locator('main').getByText(taskTitle, { exact: true })).toBeVisible();
      await page.goto(`${origin}/cases/${legalCase.id}?tab=tasks`);
      await page.getByRole('link', { name: 'เพิ่มงาน', exact: true }).click();
      const ownTitle = `งานเริ่มจากชื่อ ${data.tag}`;
      await form.locator('#case-task-title').fill(ownTitle);
      await form.getByRole('button', { name: 'สร้าง', exact: true }).click();
      await expect(page.getByRole('button', { name: 'ยืนยันว่าจะทำงานนี้วันนี้', exact: true })).toBeVisible();
      const ownTask = await data.db.task.findFirstOrThrow({ where: { caseId: legalCase.id, title: ownTitle } });
      expect(ownTask.assigneeId).toBe(auth.user.id); expect(ownTask.dueDate).toBeNull(); expect(ownTask.requiresReview).toBe(false);
      expect(ownTask.acknowledgedAt).not.toBeNull(); // Creating work for yourself acknowledges it automatically.
      await page.goto(`${origin}/operations`);
      await expect(page.getByRole('heading', { name: 'ต้องจัดการวันนี้', exact: true })).toBeVisible();
    } finally { await workerContext.close(); await data.cleanup(); }
  });
}
