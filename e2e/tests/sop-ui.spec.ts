import { test, expect } from '@playwright/test';
import { localTestData } from '../helpers/test-data';

const API = process.env.E2E_API_URL ?? 'http://localhost:3001';

test('SOP creates a reusable handoff flow, fits narrow screens, and respects editing roles', async ({ page, request }, testInfo) => {
  const data = localTestData();
  try {
    const registration = await request.post(`${API}/auth/register`, { data: {
      firmName: data.firmName, firstName: 'Handoff', lastName: 'Owner', email: data.email, password: data.password,
    } });
    expect(registration.status()).toBe(201);
    const auth = await registration.json();
    const origin = `http://${auth.user.firmSlug}.localhost:3005`;
    const signIn = async (session: typeof auth, next = '/sops') => {
      const hash = new URLSearchParams({ access_token: session.accessToken, refresh_token: session.refreshToken, next, locale: 'th' });
      await page.goto(`${origin}/handoff#${hash}`);
      await expect(page.getByRole('heading', { name: 'SOP / คู่มือการทำงาน', exact: true })).toBeVisible();
    };
    await signIn(auth);
    await page.getByRole('button', { name: 'สร้าง Handoff flow', exact: true }).click();
    const drawer = page.getByRole('dialog', { name: 'สร้าง Handoff flow', exact: true });
    await drawer.getByRole('button', { name: 'ใช้ตัวอย่างรับเรื่อง', exact: true }).click();
    await expect(drawer.getByLabel('ชื่อขั้นที่ 3', { exact: true })).toHaveValue('ตรวจแนวทางก่อนแจ้งลูกความ');
    expect(await data.db.workflowTemplate.count({ where: { firmId: auth.user.firmId } })).toBe(0);
    await drawer.getByRole('button', { name: 'ยกเลิก', exact: true }).click();
    await page.getByRole('button', { name: 'สร้าง Handoff flow', exact: true }).click();
    await drawer.getByRole('button', { name: 'บันทึก', exact: true }).click();
    await expect(drawer.getByRole('alert')).toHaveText('ตั้งชื่อแม่แบบก่อน');
    const name = `ส่งต่อ ${data.tag} ${'A'.repeat(100)}`;
    await drawer.getByRole('textbox', { name: 'ชื่อแม่แบบ', exact: true }).fill(name);
    await drawer.getByText('คำอธิบาย (ไม่บังคับ)', { exact: true }).click();
    await drawer.getByLabel('อธิบาย (ไม่บังคับ)', { exact: true }).fill('ตรวจคำอธิบายก่อนส่งต่อ');
    await drawer.getByRole('button', { name: 'บันทึก', exact: true }).click();
    await expect(drawer.getByRole('alert')).toBeVisible();
    await drawer.getByLabel('ชื่อขั้นที่ 1', { exact: true }).fill('ตรวจต้นฉบับ');
    await expect(drawer.getByLabel('วิธีทำขั้นที่ 1', { exact: true })).toBeHidden();
    await drawer.getByLabel('รายละเอียดขั้นที่ 1', { exact: true }).click();
    await drawer.getByLabel('วิธีทำขั้นที่ 1', { exact: true }).fill('ตรวจหลักฐานเฉพาะสายงานก่อนส่งต่อ');
    await drawer.getByRole('combobox', { name: /ใครทำ/ }).selectOption('OWNER');
    await drawer.getByLabel('ภายใน (วันทำการ)', { exact: true }).fill('2');
    await drawer.getByRole('button', { name: 'เพิ่มขั้น', exact: true }).click();
    await drawer.getByLabel('ชื่อขั้นที่ 2', { exact: true }).fill('ส่งผลให้ลูกความ');
    await drawer.getByRole('combobox', { name: /ใครทำ/ }).nth(1).selectOption('OWNER');
    await drawer.getByLabel('ต้องมีผู้ตรวจก่อนส่งต่อ', { exact: true }).nth(1).check();
    await drawer.getByRole('button', { name: 'เลื่อนขึ้น', exact: true }).nth(1).click();
    await expect(drawer.getByLabel('ชื่อขั้นที่ 1', { exact: true })).toHaveValue('ส่งผลให้ลูกความ');
    await drawer.getByRole('button', { name: 'เลื่อนลง', exact: true }).first().click();
    await drawer.getByRole('button', { name: 'เพิ่มขั้น', exact: true }).click();
    await drawer.getByRole('button', { name: 'ลบขั้นที่ 3', exact: true }).click();
    for (const width of [320, 375, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const bounds = await drawer.boundingBox();
      expect(bounds!.y).toBe(0);
      expect(bounds!.height).toBe(900);
      expect(await drawer.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
      expect((await drawer.getByLabel('ชื่อขั้นที่ 1', { exact: true }).boundingBox())!.width).toBeGreaterThan(120);
      await drawer.locator('aside').evaluate(el => el.scrollTop = 0);
      await page.screenshot({ animations: 'disabled', path: testInfo.outputPath(`handoff-editor-${width}.png`) });
    }
    await page.route('**/workflows/templates', route => route.request().method() === 'POST'
      ? route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"บันทึกไม่สำเร็จ ลองอีกครั้ง"}' })
      : route.continue(), { times: 1 });
    await drawer.getByRole('button', { name: 'บันทึก', exact: true }).click();
    await expect(drawer.getByRole('alert')).toContainText('บันทึกไม่สำเร็จ');
    await expect(drawer.getByRole('textbox', { name: 'ชื่อแม่แบบ', exact: true })).toHaveValue(name);
    await expect(drawer.getByLabel('ชื่อขั้นที่ 1', { exact: true })).toHaveValue('ตรวจต้นฉบับ');
    await drawer.getByRole('button', { name: 'บันทึก', exact: true }).click();
    await expect(drawer).toHaveCount(0);
    const template = await data.db.workflowTemplate.findFirstOrThrow({ where: { firmId: auth.user.firmId, name } });
    expect(template.steps).toEqual([
      { title: 'ตรวจต้นฉบับ', role: 'OWNER', durationDays: 2, instructions: 'ตรวจหลักฐานเฉพาะสายงานก่อนส่งต่อ', requiresReview: false },
      { title: 'ส่งผลให้ลูกความ', role: 'OWNER', durationDays: 1, requiresReview: true },
    ]);
    const defaultSelect = page.getByRole('combobox', { name: 'แม่แบบเริ่มต้นของสำนักงาน', exact: true });
    await defaultSelect.selectOption(template.id);
    await expect(page.getByText('ค่าเริ่มต้นของสำนักงาน', { exact: true })).toHaveCount(1);
    await page.reload();
    await page.getByRole('button', { name: 'Handoff flow', exact: true }).click();
    const search = page.getByRole('textbox', { name: 'ค้นหาคู่มือหรือขั้นตอน', exact: true });
    await search.fill('หลักฐานเฉพาะสายงาน');
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
    await search.fill('ไม่มีสายงานนี้');
    await expect(page.getByText('ไม่พบสายงานส่งต่อที่ค้นหา', { exact: true })).toBeVisible();
    await search.fill('');
    await page.getByRole('button', { name: `แก้ ${name}`, exact: true }).click();
    const editing = page.getByRole('dialog', { name: 'แก้ Handoff flow', exact: true });
    await editing.getByText('คำอธิบาย (ไม่บังคับ) · มีข้อมูลแล้ว', { exact: true }).click();
    await editing.getByLabel('อธิบาย (ไม่บังคับ)', { exact: true }).fill('');
    await expect(editing.getByLabel('ชื่อขั้นที่ 2', { exact: true })).toHaveValue('ส่งผลให้ลูกความ');
    await editing.getByLabel('รายละเอียดขั้นที่ 2', { exact: true }).click();
    await editing.getByLabel('วิธีทำขั้นที่ 2', { exact: true }).fill('แนบเอกสารที่ตรวจแล้ว');
    await editing.getByRole('button', { name: 'บันทึก', exact: true }).click();
    await expect(editing).toHaveCount(0);
    const updated = await data.db.workflowTemplate.findUniqueOrThrow({ where: { id: template.id } });
    expect(updated.isDefault).toBe(true);
    expect(updated.description).toBe('');
    expect((updated.steps as { instructions?: string }[])[1].instructions).toBe('แนบเอกสารที่ตรวจแล้ว');
    await page.locator('article').filter({ has: page.getByRole('heading', { name, exact: true }) }).locator('summary').click();
    await expect(page.getByText('แนบเอกสารที่ตรวจแล้ว', { exact: true })).toBeVisible();
    for (const width of [320, 375, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      expect(await page.locator('main').evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
      await page.screenshot({ animations: 'disabled', path: testInfo.outputPath(`sop-handoff-${width}.png`) });
    }
    await page.goto(`${origin}/workflows?tab=templates`);
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
    await expect(defaultSelect).toHaveValue(template.id);
    await defaultSelect.selectOption('');
    await expect(page.getByText('ค่าเริ่มต้นของสำนักงาน', { exact: true })).toHaveCount(0);
    expect((await data.db.workflowTemplate.findUniqueOrThrow({ where: { id: template.id } })).isDefault).toBe(false);
    await defaultSelect.selectOption(template.id);
    await expect(defaultSelect).toBeEnabled();
    const legalCase = await data.db.case.create({ data: {
      firmId: auth.user.firmId, ownRef: data.tag, folderId: data.tag, title: data.tag, leadLawyerId: auth.user.id,
    } });
    await page.goto(`${origin}/cases/${legalCase.id}?tab=tasks`);
    await page.getByRole('button', { name: 'เริ่มสายงาน', exact: true }).click();
    const start = page.getByRole('dialog', { name: 'เริ่มสายงาน', exact: true });
    await expect(start.getByLabel('แม่แบบ', { exact: true })).toHaveValue(template.id);
    await expect(start.getByLabel('ผู้รับขั้นที่ 1', { exact: true })).toHaveValue(auth.user.id);
    expect(await data.db.workflowRun.count({ where: { caseId: legalCase.id } })).toBe(0);
    await start.getByRole('button', { name: 'ยกเลิก', exact: true }).click();

    const ownUser = await data.db.user.findUniqueOrThrow({ where: { id: auth.user.id } });
    for (const role of ['SENIOR_LAWYER', 'LAWYER'] as const) {
      const staff = await data.db.user.create({ data: {
        email: `${data.tag}-${role}@example.test`, passwordHash: ownUser.passwordHash, firstName: role, lastName: 'Test', role: 'LAWYER',
        firmMembers: { create: { firmId: auth.user.firmId, role } },
      } });
      const session = await (await request.post(`${API}/auth/login`, { data: { email: staff.email, password: data.password } })).json();
      await page.getByRole('button', { name: 'ออกจากระบบ', exact: true }).click();
      await expect(page).toHaveURL(/\/login$/);
      await signIn(session);
      await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
      if (role === 'SENIOR_LAWYER') {
        await page.getByRole('button', { name: 'สร้าง Handoff flow', exact: true }).click();
        await expect(drawer).toBeVisible();
        await drawer.getByRole('button', { name: 'ยกเลิก', exact: true }).click();
      } else {
        await expect(page.getByRole('button', { name: 'สร้าง Handoff flow', exact: true })).toHaveCount(0);
        await expect(page.getByRole('button', { name: `แก้ ${name}`, exact: true })).toHaveCount(0);
        await expect(defaultSelect).toHaveCount(0);
        expect((await request.post(`${API}/workflows/templates`, { headers: { Authorization: `Bearer ${session.accessToken}` },
          data: { name: 'Forbidden', steps: [{ title: 'Step', role: 'OWNER', durationDays: 1 }] } })).status()).toBe(403);
      }
    }
  } finally { await data.cleanup(); }
});

for (const width of [375, 1440]) {
  test(`SOP library, publishing and case application at ${width}px`, async ({ page, request }, testInfo) => {
    const data = localTestData();
    try {
      const response = await request.post(`${API}/auth/register`, { data: {
        firmName: data.firmName, firstName: 'ทดสอบ', lastName: 'SOP', email: data.email, password: data.password,
      } });
      expect(response.status()).toBe(201);
      const auth = await response.json();
      const origin = `http://${auth.user.firmSlug}.localhost:3005`;
      const client = await data.db.client.create({ data: { firmId: auth.user.firmId, name: data.tag } });
      const legalCase = await data.db.case.create({ data: { firmId: auth.user.firmId, clientId: client.id, leadLawyerId: auth.user.id, title: data.tag, ownRef: data.tag, folderId: data.tag } });
      await page.setViewportSize({ width, height: 900 });
      const hash = new URLSearchParams({ access_token: auth.accessToken, refresh_token: auth.refreshToken, next: '/sops', locale: 'th' });
      await page.goto(`${origin}/handoff#${hash}`);
      await expect(page.getByRole('heading', { name: 'SOP / คู่มือการทำงาน', exact: true })).toBeVisible();
      // Explicit help stays available; new screens no longer interrupt with an automatic tour.
      await expect(page.getByRole('button', { name: 'ปิดคำแนะนำ', exact: true })).toHaveCount(0);
      if (width === 1440) {
        await page.getByRole('button', { name: 'ดูคำแนะนำการใช้งานอีกครั้ง', exact: true }).click();
        await page.getByRole('button', { name: 'ปิดคำแนะนำ', exact: true }).click();
      }
      await page.getByRole('button', { name: 'เขียนคู่มือ', exact: true }).click();
      const form = page.getByRole('form', { name: 'เขียนคู่มือ', exact: true });
      const title = form.getByRole('textbox', { name: 'ชื่อคู่มือ *', exact: true });
      const content = form.getByRole('textbox', { name: 'ขั้นตอนการทำงาน *', exact: true });
      await form.getByRole('button', { name: 'บันทึกคู่มือ', exact: true }).click();
      expect(await title.evaluate((el: HTMLInputElement) => el.validity.valueMissing)).toBe(true);
      await title.fill('   '); await content.fill('   ');
      await form.getByRole('button', { name: 'บันทึกคู่มือ', exact: true }).click();
      await expect(form.getByRole('alert')).toHaveText('กรอกชื่อคู่มือและขั้นตอนการทำงานก่อนบันทึก');
      const manualName = `คู่มือ ${data.tag} ${'A'.repeat(100)}`;
      await title.fill(manualName); await content.fill('1. ตรวจหลักฐานเฉพาะคู่มือ\n2. ส่งทนายตรวจ');
      await expect(form.getByRole('textbox', { name: 'หมวดคู่มือ', exact: true })).toBeHidden();
      // Only failure is simulated; successful persistence below uses the real local API/database.
      await page.route('**/sops', route => route.request().method() === 'POST'
        ? route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"บริการไม่พร้อม กรุณาลองอีกครั้ง"}' }) : route.continue(), { times: 1 });
      await form.getByRole('button', { name: 'บันทึกคู่มือ', exact: true }).click();
      await expect(form.getByRole('alert')).toBeVisible();
      await expect(title).toHaveValue(manualName); await expect(content).toHaveValue('1. ตรวจหลักฐานเฉพาะคู่มือ\n2. ส่งทนายตรวจ');
      await form.getByRole('button', { name: 'บันทึกคู่มือ', exact: true }).click();
      await expect(form).toHaveCount(0);
      await expect(page.getByRole('status').filter({ hasText: `บันทึกคู่มือ “${manualName}” แล้ว` })).toBeVisible();
      await expect(page.getByText('1. ตรวจหลักฐานเฉพาะคู่มือ\n2. ส่งทนายตรวจ', { exact: true })).toBeVisible();
      const manual = await data.db.sop.findFirstOrThrow({ where: { firmId: auth.user.firmId, title: manualName } });
      expect(manual.category).toBeNull();
      await page.getByRole('button', { name: `แก้ไข ${manualName}`, exact: true }).click();
      await form.locator('summary').click();
      await form.getByRole('textbox', { name: 'หมวดคู่มือ', exact: true }).fill('รับเรื่อง');
      await form.locator('summary').click();
      await form.getByRole('button', { name: 'บันทึกคู่มือ', exact: true }).click();
      await expect(form).toHaveCount(0);
      expect((await data.db.sop.findUniqueOrThrow({ where: { id: manual.id } })).category).toBe('รับเรื่อง');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.getByRole('button', { name: `แก้ไข ${manualName}`, exact: true }).click();
      await form.locator('summary').click();
      await form.getByRole('textbox', { name: 'หมวดคู่มือ', exact: true }).fill('');
      await form.getByRole('button', { name: 'บันทึกคู่มือ', exact: true }).click();
      await expect(form).toHaveCount(0);
      expect((await data.db.sop.findUniqueOrThrow({ where: { id: manual.id } })).category).toBe('');

      await page.getByRole('link', { name: 'สร้าง SOP อัตโนมัติ', exact: true }).click();
      const publish = page.getByRole('button', { name: 'บันทึกและเผยแพร่', exact: true });
      const sopName = page.getByRole('textbox', { name: 'ชื่อ SOP', exact: true });
      await expect(sopName).toBeVisible();
      await expect(page.getByRole('combobox', { name: 'ผูกกับประเภทคดี (ถ้ามี)', exact: true })).toBeHidden();
      await publish.click();
      await expect(page.getByText('กรอกชื่อ SOP ก่อน', { exact: true })).toBeVisible();
      await expect(page.getByText('เพิ่มงานอย่างน้อย 1 ขั้นตอน', { exact: true })).toBeVisible();
      const autoName = `SOP ${data.tag}`;
      await sopName.fill(autoName);
      const addTitle = page.getByRole('textbox', { name: 'ชื่องานใหม่', exact: true });
      await addTitle.fill('ตรวจเอกสารรับเรื่อง'); await addTitle.press('Enter');
      const stepTitle = page.getByRole('textbox', { name: 'ชื่องานขั้นตอน 1', exact: true });
      await stepTitle.fill(''); await publish.click();
      await expect(page.getByText('กรอกชื่องานก่อน', { exact: true })).toBeVisible();
      await stepTitle.fill('ตรวจเอกสารรับเรื่อง');
      await page.route('**/practice-setup/playbooks', route => route.request().method() === 'POST'
        ? route.fulfill({ status: 401, contentType: 'application/json', body: '{"message":"Unauthorized"}' }) : route.continue(), { times: 1 });
      const refreshed = page.waitForResponse(r => r.url() === `${API}/auth/refresh` && r.status() === 201);
      await publish.click();
      await refreshed;
      await expect(sopName).toHaveValue(autoName);
      await page.getByRole('button', { name: 'ดู SOP รุ่นใหม่', exact: true }).click();
      await expect(page).toHaveURL(/\/playbooks\/[0-9a-f-]+$/);
      const first = await data.db.playbookRelease.findFirstOrThrow({ where: { firmId: auth.user.firmId, name: autoName, version: 1 } });
      expect(first.caseTypeId).toBeNull();
      expect(first.steps).toEqual([{ title: 'ตรวจเอกสารรับเรื่อง', instructions: '' }]);
      await page.getByRole('button', { name: 'รายละเอียด', exact: true }).click();
      await page.getByRole('textbox', { name: 'วิธีทำ / ข้อควรระวัง (ถ้ามี)', exact: true }).fill('ตรวจต้นฉบับก่อนส่งทนาย');
      await page.getByRole('button', { name: 'รายละเอียด', exact: true }).click();
      await addTitle.fill('ทนายสรุปแนวทาง'); await addTitle.press('Enter');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await testInfo.attach(`sop-${width}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
      await publish.click(); await page.getByRole('button', { name: 'ดู SOP รุ่นใหม่', exact: true }).click();
      const second = await data.db.playbookRelease.findFirstOrThrow({ where: { firmId: auth.user.firmId, name: autoName, version: 2 } });
      expect(second.steps).toEqual([{ title: 'ตรวจเอกสารรับเรื่อง', instructions: 'ตรวจต้นฉบับก่อนส่งทนาย' }, { title: 'ทนายสรุปแนวทาง', instructions: '' }]);
      expect((await data.db.playbookRelease.findUniqueOrThrow({ where: { id: first.id } })).steps).toEqual(first.steps);
      await page.getByRole('link', { name: '← คู่มือการทำงาน', exact: true }).click();
      const search = page.getByRole('textbox', { name: 'ค้นหาคู่มือหรือขั้นตอน', exact: true });
      await search.fill('หลักฐานเฉพาะคู่มือ');
      await expect(page.getByRole('button', { name: new RegExp(`^${manualName}`) })).toBeVisible();
      await page.getByRole('button', { name: /^สร้างงานอัตโนมัติ \(/ }).click();
      await expect(page.getByText('ไม่พบคู่มือที่ค้นหา', { exact: true })).toBeVisible();
      await search.fill('ต้นฉบับ');
      await expect(page.getByText(autoName, { exact: true })).toHaveCount(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.getByText(autoName, { exact: true }).click();
      await page.getByRole('link', { name: 'ใช้กับคดี', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'เลือกคดีที่จะใช้ SOP', exact: true })).toBeVisible();
      if (width < 768) await page.locator(`a[href="/cases/${legalCase.id}?tab=tasks&sop=${second.id}"]:visible`).click();
      else await page.getByRole('row').filter({ hasText: data.tag }).click();
      await expect(page).toHaveURL(`${origin}/cases/${legalCase.id}?tab=tasks&sop=${second.id}`);
      const select = page.getByRole('combobox', { name: 'SOP อัตโนมัติ', exact: true });
      await expect(select).toBeVisible(); // SOP and case context arrive with the preview open.
      await expect(select).toHaveValue(second.id);
      await expect(select.locator(`option[value="${first.id}"]`)).toHaveCount(0); // Latest version per SOP only.
      await expect(select.locator(`option[value="${second.id}"]`)).toHaveCount(1);
      expect(await data.db.task.count({ where: { caseId: legalCase.id } })).toBe(0);
      await expect(page.getByText('ตรวจต้นฉบับก่อนส่งทนาย', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'ยืนยันเพิ่มงานตามรายการ', exact: true }).click();
      await expect(page.getByRole('status').filter({ hasText: 'เพิ่มงานจาก SOP แล้ว' })).toBeVisible();
      const tasks = await data.db.task.findMany({ where: { caseId: legalCase.id } });
      expect(tasks.map(t => t.title).sort()).toEqual(['ตรวจเอกสารรับเรื่อง', 'ทนายสรุปแนวทาง'].sort());
      expect(tasks.every(t => t.assigneeId === auth.user.id)).toBe(true);
      await page.reload();
      await expect(page.getByText('คดีนี้ใช้ SOP นี้แล้ว จะไม่เพิ่มงานซ้ำ', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'ยืนยันเพิ่มงานตามรายการ', exact: true })).toBeDisabled();
      expect(await data.db.task.count({ where: { caseId: legalCase.id } })).toBe(2);
    } finally { await data.cleanup(); }
  });
}
