import { test, expect, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { localTestData } from '../helpers/test-data';

const dir = process.env.E2E_SHOTS_DIR ?? 'e2e/report/process-clarity';
const data = localTestData();
const results: string[] = [], errors: string[] = [];
let origin = '', caseId = '', ref = '', secondId = '';
const first = `ก่อนฟ้อง ${data.tag}`, second = `ในศาล ${data.tag}`;

test.afterAll(async () => {
  try { await data.cleanup(); } finally {
    await mkdir(dir, { recursive: true });
    await writeFile(`${dir}/process-clarity-report.md`, `# Process clarity E2E\n\n${results.length ? results.join('\n\n') : '- BLOCKED all flows: browser did not launch; see /tmp/e2e-pc.log.'}\n\n## Console / network errors\n\n${errors.length ? errors.join('\n') : results.length ? 'None observed.' : 'Not observed: browser did not launch.'}\n`);
  }
});

test('process clarity click-through', async ({ page, request }) => {
  test.setTimeout(240_000);
  await mkdir(`${dir}/e2e-shots`, { recursive: true });
  page.on('console', msg => { if (msg.type() === 'error') errors.push(`console: ${msg.text()}`); });
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('response', response => { if (response.status() >= 400 && !(response.status() === 401 && !origin)) errors.push(`HTTP ${response.status()} ${response.url()}`); });
  page.on('requestfailed', req => errors.push(`request failed: ${req.url()} ${req.failure()?.errorText}`));
  const shot = async (name: string) => page.screenshot({ path: `${dir}/e2e-shots/${name}.png`, fullPage: true });
  const flow = async (name: string, fn: () => Promise<void>) => {
    try { await fn(); results.push(`- PASS ${name}`); }
    catch (error) { results.push(`- FAIL ${name}: ${String(error).replace(/\x1b\[[0-9;]*m/g, '').slice(0, 1800)}`); }
  };
  const go = async (path: string) => { await page.goto(`${origin}${path}`); const tour = page.getByRole('button', { name: 'ปิดคำแนะนำ', exact: true }); if (await tour.isVisible()) await tour.click(); };
  const create = async (title: string, court = false) => {
    await go('/cases/new');
    await page.locator('#case-type').selectOption({ label: 'คดีความ' });
    await page.locator('#case-title').fill(title);
    if (court) { await page.getByText('อยู่ในศาลแล้ว', { exact: true }).click(); await page.locator('#court-name').selectOption('__other__'); await page.locator('#court-name').locator('xpath=..').locator('input').last().fill('ศาลทดสอบ'); await page.locator('#black-case-number').fill('123/2569'); }
    await page.getByRole('button', { name: 'เปิดคดี', exact: true }).click();
    await expect(page).toHaveURL(/\/cases\/[0-9a-f-]+\/opened/, { timeout: 15000 });
    return page.url().match(/\/cases\/([0-9a-f-]+)\/opened/)![1];
  };
  const registration = await request.post(`${process.env.E2E_API_URL ?? 'http://localhost:3021'}/auth/register`, { data: { firmName: data.firmName, firstName: 'ทดสอบ', lastName: 'กระบวนการ', email: data.email, password: data.password } });
  expect(registration.status()).toBe(201);
  const auth = await registration.json();
  const web = new URL(process.env.E2E_WEB_URL ?? 'http://localhost:3026');
  origin = `${web.protocol}//${auth.user.firmSlug}.localhost:${web.port}`;
  const hash = new URLSearchParams({ access_token: auth.accessToken, refresh_token: auth.refreshToken, next: '/cases/new', locale: 'th' });
  await page.goto(`${origin}/handoff#${hash}`);
  await expect(page).toHaveURL(`${origin}/cases/new`);
  await flow('1 create form and open case', async () => {
    const tour = page.getByRole('button', { name: 'ปิดคำแนะนำ', exact: true }); if (await tour.isVisible()) await tour.click();
    await expect(page.locator('#case-type')).toBeVisible();
    await expect(page.locator('#case-title')).toBeVisible();
    await expect(page.locator('#client-combobox')).toBeVisible();
    await expect(page.locator('#lead-lawyer')).toBeVisible();
    await expect(page.getByRole('radio', { name: 'ยังไม่ฟ้อง' })).toBeChecked();
    await expect(page.locator('details').filter({ hasText: 'คู่ความและฝ่ายเรา' }).first()).not.toHaveAttribute('open', '');
    const strip = page.locator('div').filter({ has: page.getByText('เลขอ้างอิงสำนักงาน', { exact: true }) }).filter({ hasText: 'ระบบออกเลขให้อัตโนมัติ' }).last();
    await expect(strip).toContainText(/[A-Z]{2,}\d{6,}/);
    ref = ((await strip.innerText()).match(/[A-Z]{2,}\d{6,}/) ?? [''])[0];
    await page.locator('#case-type').selectOption({ label: 'คดีความ' }); await page.locator('#case-title').fill(first);
    await expect(page.getByText(/กรอกช่องบังคับครบแล้ว/)).toBeVisible(); await shot('01-create');
    await page.getByRole('button', { name: 'เปิดคดี', exact: true }).click();
    await expect(page).toHaveURL(/\/cases\/[0-9a-f-]+\/opened/, { timeout: 15000 }); caseId = page.url().match(/\/cases\/([0-9a-f-]+)\/opened/)![1];
  });
  await flow('2 success page', async () => {
    expect(caseId).toBeTruthy(); await expect(page.getByRole('heading', { name: 'เปิดคดีสำเร็จ' })).toBeVisible(); await expect(page.getByText(ref, { exact: true })).toBeVisible();
    await expect(page.getByText('ขั้นต่อไปของคดีนี้', { exact: true })).toBeVisible(); await shot('02-success');
    await page.getByRole('link', { name: 'ไปหน้าคดี', exact: true }).click(); await expect(page).toHaveURL(new RegExp(`/cases/${caseId}$`));
  });
  await flow('3 case page', async () => {
    expect(caseId).toBeTruthy(); await go(`/cases/${caseId}`);
    await expect(page.locator('li[aria-current="step"]').filter({ hasText: 'ก่อนฟ้อง' })).toBeVisible();
    await expect(page.getByText('ต้องทำตอนนี้', { exact: false }).first()).toBeVisible();
    const overview = page.locator('#case-tab-overview'); await expect(overview).toHaveAttribute('aria-current', 'page'); await expect(page.locator('#case-tab-documents')).not.toHaveAttribute('aria-current', 'page');
    await expect(page.getByText('เปลี่ยนขั้นเอง', { exact: false })).toBeHidden(); await shot('03-case');
    await overview.click(); await expect(page.locator('#case-tabpanel-overview')).toBeVisible();
    await page.getByRole('button', { name: 'อื่น ๆ' }).click(); await expect(page.getByText('เปลี่ยนขั้นเอง', { exact: false })).toBeVisible();
  });
  await flow('4 create case already in court', async () => { secondId = await create(second, true); await expect(page.getByRole('heading', { name: 'เปิดคดีสำเร็จ' })).toBeVisible(); });
  await flow('5 case list and filters', async () => {
    await go('/cases'); const a = page.locator('article').filter({ hasText: first }), b = page.locator('article').filter({ hasText: second });
    await expect(a).toBeVisible(); await expect(b).toBeVisible(); for (const row of [a,b]) { await expect(row.getByText('▸ ต่อไป:', { exact: false })).toBeVisible(); await expect(row.getByRole('link', { name: 'ทำเลย →' })).toBeVisible(); }
    await shot('04-cases'); await page.getByRole('button', { name: /ก่อนฟ้อง/ }).click(); await expect(a).toBeVisible(); await expect(b).toHaveCount(0);
    await page.getByRole('button', { name: /ในศาล/ }).click(); await expect(b).toBeVisible(); await expect(a).toHaveCount(0); await b.getByRole('link', { name: 'ทำเลย →' }).click(); await expect(page).toHaveURL(new RegExp(`/cases/${secondId}`));
  });
  await flow('6 todos', async () => {
    await go('/todos'); for (const name of ['ต้องทำ', 'รอคนอื่น', 'เสร็จแล้ว']) await expect(page.getByRole('tab', { name: new RegExp(name) })).toBeVisible(); await shot('05-todos');
    const task = await data.db.task.findFirst({ where: { caseId: { in: [caseId, secondId].filter(Boolean) }, assigneeId: auth.user.id, status: { not: 'DONE' } } });
    if (task) { await page.getByRole('checkbox', { name: `ทำ ${task.title} เสร็จ` }).click(); await expect(page.getByRole('status').filter({ hasText: /คดี.*(ทำครบ|เหลืออีก)/ })).toBeVisible(); }
    else results.push('- INFO todos: no assigned case task existed, so conditional completion was not exercised.');
  });
  for (const path of ['/expenses','/invoices','/leaves']) await flow(`7 ${path} tabs and empty states`, async () => {
    await go(path); const tabs = page.getByRole('tablist', { name: 'ผู้ดำเนินการถัดไป' }).getByRole('tab'); await expect(tabs.first()).toBeVisible(); expect(await tabs.count()).toBeGreaterThan(1);
    for (let i=0;i<await tabs.count();i++) { const tab=tabs.nth(i); await expect(tab.locator('span')).toHaveText(/\d+/); await tab.click(); await expect(page.getByText(/ไม่มีรายการที่ต้องทำ/).first()).toBeVisible(); }
  });
  await flow('7 expense creation', async () => {
    await go('/expenses/new'); await page.locator('#expense-amount').fill('100'); await page.getByLabel(/^รายละเอียด/).first().fill(`ค่าใช้จ่าย ${data.tag}`); await page.getByRole('button', { name: 'บันทึกไว้ก่อน' }).click();
    await expect(page.getByText('บันทึกแล้ว', { exact: true })).toBeVisible(); await page.getByRole('button', { name: 'ไปหน้าค่าใช้จ่าย →' }).click();
    await page.getByRole('tab', { name: /ต้องทำ/ }).click(); const row=page.locator('article').filter({ hasText: `ค่าใช้จ่าย ${data.tag}` }); await expect(row).toBeVisible(); await expect(row.locator('[aria-label^="ขั้น "]')).toBeVisible(); await shot('06-expenses');
  });
  for (const [name,pathOf] of [['cases',() => '/cases'],['case',() => `/cases/${caseId}`],['create',() => '/cases/new']] as const) await flow(`8 phone ${name}`, async () => {
    const path = pathOf(); expect(path).not.toBe('/cases/'); await page.setViewportSize({ width:390, height:844 }); await go(path); await page.waitForLoadState('networkidle'); await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible(); await expect.poll(() => page.evaluate(() => document.scrollingElement!.scrollWidth <= innerWidth + 1)).toBe(true); await shot(`07-phone-${name}`);
  });
  await flow('console and network', async () => { expect(errors).toEqual([]); });
  expect(results.filter(item => item.startsWith('- FAIL')), results.join('\n\n')).toEqual([]);
});
