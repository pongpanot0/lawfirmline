import { test, expect } from '@playwright/test';

test('trial call to action reaches a working registration form', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'ขอทดลองใช้งานฟรี', exact: true }).click();
  await expect(page).toHaveURL(/\/register$/);
  await expect(page.getByRole('textbox', { name: 'ชื่อสำนักงาน', exact: true })).toBeVisible();
});

test('login fields have accessible labels and errors are announced', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('อีเมล', { exact: true }).fill('e2e-missing@example.test');
  await page.getByLabel('รหัสผ่าน', { exact: true }).fill('incorrect-password');
  await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
  await expect(page.locator('form').getByRole('alert')).toContainText('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
});

import { localTestData } from '../helpers/test-data';
import { randomBytes } from 'node:crypto';

const API = process.env.E2E_API_URL ?? 'http://localhost:3001';

async function fillRegistration(page: import('@playwright/test').Page, data: ReturnType<typeof localTestData>) {
  await page.getByLabel('ชื่อสำนักงาน', { exact: true }).fill(data.firmName);
  await page.getByLabel('ชื่อ', { exact: true }).fill('ทดสอบ');
  await page.getByLabel('นามสกุล', { exact: true }).fill('สำนักงาน');
  await page.getByLabel('อีเมล', { exact: true }).fill(data.email);
  await page.getByLabel('รหัสผ่าน', { exact: true }).fill(data.password);
}

test('new firm → first client and task → invitation → member permissions → logout and login', async ({ page, browser }) => {
  test.setTimeout(120_000);
  const data = localTestData();
  const errors: string[] = [];
  page.on('pageerror', err => errors.push(err.message));
  try {
    await page.goto('/register');
    await fillRegistration(page, data);
    const registration = page.waitForResponse(r => r.url().endsWith('/auth/register') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'สร้างสำนักงาน', exact: true }).click();
    const result = await registration;
    expect(result.status()).toBe(201);
    const authResponse = await page.request.post(`${API}/auth/login`, { data: { email: data.email, password: data.password } });
    expect(authResponse.ok()).toBe(true);
    const session = await authResponse.json();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.locator('main h1')).toHaveText('แดชบอร์ด');
    expect(new URL(page.url()).hostname).toBe(`${session.user.firmSlug}.localhost`);
    const origin = new URL(page.url()).origin;
    const adminLogin = await page.request.post(`${API}/auth/login`, { data: { email: 'admin@lawfirm.com', password: 'password123' } });
    const adminToken = (await adminLogin.json()).accessToken;
    const existingCases = await page.request.get(`${API}/cases`, { headers: { Authorization: `Bearer ${adminToken}` } });
    const otherCase = (await existingCases.json())[0];
    expect(otherCase?.id, 'seed firm has a case for tenant-isolation proof').toBeTruthy();
    const forbiddenCase = await page.request.get(`${API}/cases/${otherCase.id}`, { headers: { Authorization: `Bearer ${session.accessToken}` } });
    expect([403, 404]).toContain(forbiddenCase.status());
    await page.reload();
    await expect(page.locator('main h1')).toHaveText('แดชบอร์ด');
    await expect(page.locator('main')).toContainText(data.firmName);

    await page.goto(`${origin}/clients/new`);
    await page.locator('main input').first().fill(`ลูกค้าทดสอบ ${data.tag}`);
    await page.locator('form button[type="submit"]').click();
    await expect(page).toHaveURL(/\/clients\?id=/);
    await expect(page.locator('main')).toContainText(`ลูกค้าทดสอบ ${data.tag}`);

    await page.goto(`${origin}/cases/new`);
    await page.getByRole('button', { name: /^Litigation/ }).click();
    await page.getByRole('textbox', { name: 'ชื่อคดี *', exact: true }).fill(`คดีทดสอบ ${data.tag}`);
    await page.getByRole('button', { name: 'ถัดไป', exact: true }).click();
    await page.locator('#lead-lawyer').selectOption(session.user.id);
    await page.getByRole('button', { name: 'สร้างคดี', exact: true }).click();
    await expect(page).toHaveURL(/\/cases\/[0-9a-f-]+$/, { timeout: 45_000 });
    await expect(page.locator('main')).toContainText(`คดีทดสอบ ${data.tag}`);

    await page.goto(`${origin}/expenses/new`);
    await page.locator('form input[type="number"]').fill('125.50');
    await page.locator('form input[required]').nth(1).fill(`ค่าเอกสารทดสอบ ${data.tag}`);
    await page.locator('form button[type="submit"]').click();
    await expect(page).toHaveURL(/\/expenses$/);
    await expect(page.locator('main')).toContainText(`ค่าเอกสารทดสอบ ${data.tag}`);

    await page.goto(`${origin}/todos`);
    await page.getByRole('button', { name: 'เพิ่มงาน', exact: true }).click();
    await page.getByPlaceholder('ชื่องาน...').fill(`เตรียมเอกสาร ${data.tag}`);
    await page.locator('form button[type="submit"]').click();
    await expect(page.locator('main')).toContainText(`เตรียมเอกสาร ${data.tag}`);
    await page.reload();
    await expect(page.locator('main')).toContainText(`เตรียมเอกสาร ${data.tag}`);

    await page.getByText(`เตรียมเอกสาร ${data.tag}`, { exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.locator('#td-status').selectOption('IN_PROGRESS');
    await expect(page.locator('#td-status')).toBeEnabled();
    await page.getByPlaceholder('ชื่องานย่อย...').fill(`ตรวจรายการ ${data.tag}`);
    await page.getByRole('button', { name: 'เพิ่มงานย่อย', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText(`ตรวจรายการ ${data.tag}`);
    await page.getByRole('dialog').press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await page.goto(`${origin}/team`);
    await expect(page.locator('main h1')).toHaveText('จัดการทีม');
    const inviteToken = randomBytes(32).toString('hex');
    await data.db.invitation.create({ data: { firmId: session.user.firmId, invitedById: session.user.id, email: `${data.tag}-member@example.test`, role: 'LAWYER', token: inviteToken, expiresAt: new Date(Date.now() + 3600000) } });
    await page.reload();
    await expect(page.locator('main')).toContainText(`${data.tag}-member@example.test`);
    const memberContext = await browser.newContext();
    try {
      const member = await memberContext.newPage();
      await member.goto(`${origin}/invite/${inviteToken}`);
      await member.getByLabel('ชื่อ', { exact: true }).fill('ทนายทดสอบ');
      await member.getByLabel('นามสกุล', { exact: true }).fill('สมาชิก');
      await member.getByLabel('รหัสผ่าน', { exact: true }).fill(data.password);
      await member.getByRole('button', { name: 'เข้าร่วมสำนักงาน', exact: true }).click();
      await expect(member).toHaveURL(/\/dashboard$/);
      await expect(member.locator('main h1')).toContainText('ทนายทดสอบ');
      const memberLogin = await member.request.post(`${API}/auth/login`, { data: { email: `${data.tag}-member@example.test`, password: data.password } });
      const memberSession = await memberLogin.json();
      const restrictedTeam = await member.request.get(`${API}/saas/members`, { headers: { Authorization: `Bearer ${memberSession.accessToken}` } });
      expect(restrictedTeam.status()).toBe(403);
      await member.goto(`${origin}/team`);
      await expect(member.locator('main')).toContainText('เฉพาะเจ้าของ');
      await member.getByRole('button', { name: 'ออกจากระบบ', exact: true }).click();
      await expect(member).toHaveURL(/\/login$/);
      await member.goto(`${origin}/dashboard`);
      await expect(member).toHaveURL(/\/login$/);
      await member.goto(`${origin}/invite/${inviteToken}`);
      await expect(member.locator('p[role="alert"]')).toContainText('หมดอายุ');
    } finally { await memberContext.close(); }

    await page.goto(`${origin}/team`);
    await expect(page.locator('table')).toContainText('ทนายทดสอบ');
    await page.getByRole('button', { name: 'ออกจากระบบ', exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel('อีเมล', { exact: true }).fill(data.email);
    await page.getByLabel('รหัสผ่าน', { exact: true }).fill(data.password);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.locator('main h1')).toHaveText('แดชบอร์ด');
    expect(errors).toEqual([]);
  } finally { await data.cleanup(); }
});

test('registration rejects duplicate email and retains form entries', async ({ page }) => {
  const data = localTestData();
  try {
    await page.goto('/register');
    await fillRegistration(page, { ...data, email: 'admin@lawfirm.com' });
    await page.getByRole('button', { name: 'สร้างสำนักงาน', exact: true }).click();
    await expect(page.locator('form [role="alert"]')).toContainText('มีบัญชีแล้ว');
    await expect(page.getByLabel('ชื่อสำนักงาน', { exact: true })).toHaveValue(data.firmName);
    await expect(page.getByRole('button', { name: 'สร้างสำนักงาน', exact: true })).toBeEnabled();
  } finally { await data.cleanup(); }
});

test('registration preserves entries after a network failure and rejects blank names', async ({ page }) => {
  const data = localTestData();
  try {
    await page.goto('/register');
    await fillRegistration(page, data);
    await page.getByLabel('ชื่อสำนักงาน', { exact: true }).fill('   ');
    await page.getByRole('button', { name: 'สร้างสำนักงาน', exact: true }).click();
    expect(await page.getByLabel('ชื่อสำนักงาน', { exact: true }).evaluate((el: HTMLInputElement) => el.checkValidity())).toBe(false);
    await page.getByLabel('ชื่อสำนักงาน', { exact: true }).fill(data.firmName);
    await page.route('**/auth/register', route => route.abort());
    await page.getByRole('button', { name: 'สร้างสำนักงาน', exact: true }).click();
    await expect(page.locator('form [role="alert"]')).toContainText('ไม่สำเร็จ');
    await expect(page.getByLabel('อีเมล', { exact: true })).toHaveValue(data.email);
    await expect(page.getByRole('button', { name: 'สร้างสำนักงาน', exact: true })).toBeEnabled();
  } finally { await data.cleanup(); }
});

for (const width of [320, 375, 414, 768, 1440]) {
  test(`auth forms fit at ${width}px in Thai and English`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ['/login', '/register']) {
      await page.goto(route);
      for (const lang of ['TH', 'EN']) {
        await page.getByRole('button', { name: lang, exact: true }).click();
        await expect(page.locator('main h1')).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        const submit = page.locator('button[type="submit"]');
        await expect(submit).toBeVisible();
        const box = await submit.boundingBox();
        expect(box!.width).toBeGreaterThan(100);
        expect(box!.height).toBeGreaterThanOrEqual(44);
        if (width === 375 || width === 1440) await testInfo.attach(`${route.slice(1)}-${lang}-${width}`, { body: await page.screenshot({ fullPage: true, path: testInfo.outputPath(`${route.slice(1)}-${lang}-${width}.png`) }), contentType: 'image/png' });
      }
    }
  });
}

test('invalid invitation and missing handoff have a recovery link', async ({ page }) => {
  await page.goto('/invite/e2e-invalid-token');
  await expect(page.locator('p[role="alert"]')).toContainText('หมดอายุ');
  await page.getByRole('link', { name: 'กลับไปหน้าเข้าสู่ระบบ' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/handoff');
  await expect(page.locator('p[role="alert"]')).toContainText(
    'ลิงก์เข้าสู่สำนักงานไม่ครบหรือถูกใช้ไปแล้ว กรุณาเข้าสู่ระบบใหม่',
  );
  await expect(page.getByRole('link', { name: 'กลับไปหน้าเข้าสู่ระบบ' })).toBeVisible();
});


test('registration API rejects whitespace names', async ({ request }) => {
  const data = localTestData();
  try {
    const res = await request.post(`${API}/auth/register`, { data: { firmName: data.firmName, firstName: '   ', lastName: 'Tester', email: data.email, password: data.password } });
    expect(res.status()).toBe(400);
  } finally { await data.cleanup(); }
});

test('English stays selected after login hands off to the firm', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await page.getByLabel('Email', { exact: true }).fill('admin@lawfirm.com');
  await page.getByLabel('Password', { exact: true }).fill('password123');
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.locator('main h1')).toHaveText('Dashboard');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('password reset changes only the test account, rejects reuse, and allows login', async ({ page, request }) => {
  const data = localTestData();
  try {
    const res = await request.post(`${API}/auth/register`, { data: { firmName: data.firmName, firstName: 'Recovery', lastName: 'Test', email: data.email, password: data.password } });
    expect(res.status()).toBe(201);
    const { user } = await res.json();
    const token = randomBytes(32).toString('hex');
    await data.db.passwordResetToken.create({ data: { userId: user.id, token, expiresAt: new Date(Date.now() + 3600000) } });
    await page.goto(`/reset-password?token=${token}`);
    await page.getByLabel('รหัสผ่านใหม่', { exact: true }).fill(`${data.password}-changed`);
    await page.getByRole('button', { name: 'ตั้งรหัสผ่านใหม่', exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel('อีเมล', { exact: true }).fill(data.email);
    await page.getByLabel('รหัสผ่าน', { exact: true }).fill(`${data.password}-changed`);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.locator('main h1')).toBeVisible();
    const oldPassword = await request.post(`${API}/auth/login`, { data: { email: data.email, password: data.password } });
    expect(oldPassword.status()).toBe(401);
    const replay = await request.post(`${API}/auth/reset-password`, { data: { token, password: 'E2E-replay-password' } });
    expect(replay.status()).toBe(400);
  } finally { await data.cleanup(); }
});

test('forgot password gives a neutral confirmation for an unknown address', async ({ page }) => {
  await page.goto('/forgot-password');
  await page.getByLabel('อีเมล', { exact: true }).fill(`no-account-${Date.now()}@example.test`);
  await page.getByRole('button', { name: 'ส่งลิงก์ตั้งรหัสผ่านใหม่', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('ถ้ามีบัญชี');
  await expect(page.getByRole('link', { name: 'กลับไปหน้าเข้าสู่ระบบ' })).toBeVisible();
});

test('invalid handoff cannot borrow an existing logged-in session', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('อีเมล', { exact: true }).fill('admin@lawfirm.com');
  await page.getByLabel('รหัสผ่าน', { exact: true }).fill('password123');
  await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.locator('main h1')).toBeVisible();
  const origin = new URL(page.url()).origin;
  await page.goto(`${origin}/handoff#access_token=invalid&refresh_token=invalid`);
  await expect(page.locator('p[role="alert"]')).toContainText(
    'ลิงก์เข้าสู่สำนักงานไม่ครบหรือถูกใช้ไปแล้ว กรุณาเข้าสู่ระบบใหม่',
  );
  await expect(page).toHaveURL(`${origin}/handoff`);
});
