import { test, expect } from '@playwright/test';
import { localTestData } from '../helpers/test-data';

const API = process.env.E2E_API_URL ?? 'http://localhost:3001';

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
      if (width < 768) await page.locator(`a[href="/cases/${legalCase.id}?tab=tasks&sop=${second.id}"]`).click();
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
