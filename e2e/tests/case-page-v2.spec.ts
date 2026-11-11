import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { localTestData } from '../helpers/test-data';

// Click-through for case page v2 (docs/design/2026-11-11-case-page-v2). Local hosts and a throwaway firm only.
const dir = process.env.E2E_SHOTS_DIR ?? 'e2e/report/case-page-v2';
const data = localTestData();
const results: string[] = [], errors: string[] = [];

test.afterAll(async () => {
  try { await data.cleanup(); } finally {
    await mkdir(dir, { recursive: true });
    await writeFile(`${dir}/report.md`, `# Case page v2 E2E\n\n${results.join('\n')}\n\n## Console / network errors\n\n${errors.length ? errors.join('\n') : 'None observed.'}\n`);
  }
});

test('case page v2 click-through', async ({ page, request }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await mkdir(`${dir}/shots`, { recursive: true });
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`console: ${msg.text()}`); });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('response', (r) => { if (r.status() >= 500) errors.push(`HTTP ${r.status()} ${r.url()}`); });
  const shot = (name: string) => page.screenshot({ path: `${dir}/shots/${name}.png`, fullPage: true });
  const flow = async (name: string, fn: () => Promise<void>) => {
    try { await fn(); results.push(`- PASS ${name}`); }
    catch (error) { results.push(`- FAIL ${name}: ${String(error).replace(/\x1b\[[0-9;]*m/g, '').slice(0, 1200)}`); await shot(`fail-${name.split(' ')[0]}`).catch(() => {}); }
  };
  const api = process.env.E2E_API_URL ?? 'http://localhost:3031';
  const registration = await request.post(`${api}/auth/register`, { data: { firmName: data.firmName, firstName: 'ทดสอบ', lastName: 'หน้าคดี', email: data.email, password: data.password } });
  expect(registration.status()).toBe(201);
  const auth = await registration.json();
  const web = new URL(process.env.E2E_WEB_URL ?? 'http://localhost:3036');
  const origin = `${web.protocol}//${auth.user.firmSlug}.localhost:${web.port}`;
  const closeTour = async () => { const tour = page.getByRole('button', { name: 'ปิดคำแนะนำ', exact: true }); if (await tour.isVisible().catch(() => false)) await tour.click(); };
  await page.goto(`${origin}/handoff#${new URLSearchParams({ access_token: auth.accessToken, refresh_token: auth.refreshToken, next: '/cases/new', locale: 'th' })}`);
  await expect(page).toHaveURL(`${origin}/cases/new`);
  let caseId = '';

  await flow('1 create form shows errors with links', async () => {
    await closeTour();
    await page.getByRole('button', { name: 'เปิดคดี', exact: true }).click();
    const alert = page.getByRole('alert').filter({ hasText: 'ยังเปิดคดีไม่ได้' });
    await expect(alert).toBeVisible();
    await expect(page.locator('#case-type')).toHaveAttribute('aria-invalid', 'true');
    await shot('01-create-error');
  });

  await flow('2 create case and success page', async () => {
    await page.locator('#case-type').selectOption({ label: 'คดีความ' });
    await page.locator('#case-title').fill(`ผิดสัญญา ${data.tag}`);
    const lead = page.locator('#lead-lawyer');
    if (await lead.evaluate((el) => el.tagName === 'SELECT')) { const options = await lead.locator('option').evaluateAll((o) => o.map((x) => (x as HTMLOptionElement).value).filter(Boolean)); if (options[0]) await lead.selectOption(options[0]); }
    await shot('02-create-filled');
    await page.getByRole('button', { name: 'เปิดคดี', exact: true }).click();
    await expect(page).toHaveURL(/\/cases\/[0-9a-f-]+\/opened/, { timeout: 20000 });
    caseId = page.url().match(/\/cases\/([0-9a-f-]+)\/opened/)![1];
    await expect(page.getByText('เริ่มขั้นที่ 1').first()).toBeVisible();
    await shot('03-created');
  });

  await flow('3 case page header, stage bar, card, tabs', async () => {
    await page.goto(`${origin}/cases/${caseId}`); await closeTour();
    const tabs = page.getByRole('navigation', { name: 'ส่วนต่าง ๆ ของคดี' });
    await expect(tabs.getByRole('link')).toHaveCount(8);
    await expect(page.getByText('ขั้นตอนของคดี').first()).toBeVisible();
    await expect(page.getByText(/ต้องทำตอนนี้/).first()).toBeVisible();
    for (const label of ['เพิ่มงาน', 'เพิ่มนัด', 'แนบเอกสาร']) await expect(page.getByRole('button', { name: label }).or(page.getByRole('link', { name: label })).first()).toBeVisible();
    await shot('04-case-overview');
  });

  await flow('4 more menu by keyboard', async () => {
    const trigger = page.getByRole('button', { name: 'อื่น ๆ' });
    await trigger.click();
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: /ปิดคดี/ })).toBeVisible();
    await shot('05-more-menu');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  await flow('5 tabs switch by link', async () => {
    for (const [label, key] of [['งาน', 'tasks'], ['เอกสาร', 'documents'], ['นัดและปฏิทิน', 'calendar'], ['คู่ความ', 'parties'], ['การเงิน', 'billing'], ['อีเมล', 'email'], ['ข้อความ', 'comments']] as const) {
      await page.getByRole('navigation', { name: 'ส่วนต่าง ๆ ของคดี' }).getByRole('link', { name: new RegExp(`^${label}`) }).click();
      await expect(page).toHaveURL(new RegExp(`tab=${key}`));
      await expect(page.getByRole('navigation', { name: 'ส่วนต่าง ๆ ของคดี' }).getByRole('link', { name: new RegExp(`^${label}`) })).toHaveAttribute('aria-current', 'page');
      if (['tasks', 'calendar', 'email'].includes(key)) await shot(`06-tab-${key}`);
    }
  });

  await flow('6 add appointment shows who goes', async () => {
    await page.goto(`${origin}/cases/${caseId}`); await closeTour();
    await page.getByRole('button', { name: 'เพิ่มนัด' }).or(page.getByRole('link', { name: 'เพิ่มนัด' })).first().click();
    await expect(page.getByText('ใครไปนัดนี้').first()).toBeVisible({ timeout: 10000 });
    await shot('07-add-appointment');
    await page.keyboard.press('Escape');
  });

  await flow('7 done then undo from next-action card', async () => {
    const due = new Date(Date.now() + 5 * 86400000).toISOString();
    const created = await request.post(`${api}/cases/${caseId}/tasks`, { headers: { Authorization: `Bearer ${auth.accessToken}` }, data: { title: `ยื่นคำฟ้อง ${data.tag}`, dueDate: due } });
    expect(created.ok()).toBeTruthy();
    await page.goto(`${origin}/cases/${caseId}`); await closeTour();
    const doneButton = page.getByRole('button', { name: 'ทำเสร็จแล้ว' }).first();
    await expect(doneButton).toBeVisible({ timeout: 15000 });
    await shot('08-card-task');
    await doneButton.click();
    // the live region itself is zero-size (its child is position:fixed), so assert on the toast box
    const toast = page.getByRole('status').locator('> div').filter({ hasText: /เสร็จแล้ว/ });
    await expect(toast).toBeVisible();
    await shot('09-done-toast');
    await toast.getByRole('button', { name: 'เลิกทำ' }).click();
    await expect(toast).toBeHidden();
    await expect(page.getByRole('button', { name: 'ทำเสร็จแล้ว' }).first()).toBeVisible();
  });

  await flow('8 email link dialog and search', async () => {
    await page.goto(`${origin}/cases/${caseId}?tab=email`); await closeTour();
    await page.getByRole('button', { name: /ผูกอีเมลเข้าคดี/ }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await shot('10-link-email');
    const search = dialog.getByRole('button', { name: 'หาอีเมลอื่นไม่เจอ? ค้นหาเอง' });
    await search.click();
    await dialog.getByRole('searchbox').or(dialog.getByRole('textbox')).first().fill('thammaniti');
    await page.waitForTimeout(800);
    await shot('11-email-search');
    await page.keyboard.press('Escape');
  });

  await flow('9 phone width has no page scroll', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const path of [`/cases/${caseId}`, '/cases/new']) {
      await page.goto(`${origin}${path}`); await closeTour();
      await page.waitForTimeout(800);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${path} overflows by ${overflow}px`).toBeLessThanOrEqual(1);
      await shot(`12-phone-${path.includes('new') ? 'create' : 'case'}`);
    }
  });
});
