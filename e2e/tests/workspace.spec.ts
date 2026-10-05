import { test, expect } from '../helpers/tenant-test';
import { localTestData } from '../helpers/test-data';

const routes = [
  '/dashboard', '/my-day', '/todos', '/intake', '/intake/new', '/cases', '/cases/new',
  '/clients', '/clients/new', '/court-schedule', '/calendar', '/documents', '/operations',
  '/expenses', '/expenses/new', '/team', '/settings', '/reports', '/email-intake',
  '/intake/portal-submissions', '/admin/courts', '/admin/case-types', '/admin/deadline-rules',
  '/admin/holidays', '/admin/reimbursements', '/account/billing', '/knowledge', '/admin/users', '/admin/users/new',
  '/account/billing/checkout', '/admin/audit-log', '/ai-usage', '/cases/board',
  '/expenses/claim', '/getting-started', '/invoices', '/leaves',
  '/playbooks', '/playbooks/new', '/research', '/sops', '/workflows', '/work',
];

test('office default workflow persists, is preselected for review, and stays tenant scoped', async ({ page, request }) => {
  const data = localTestData();
  const apiUrl = process.env.E2E_API_URL ?? 'http://localhost:3001';
  try {
    const registration = await request.post(`${apiUrl}/auth/register`, { data: {
      firmName: data.firmName, firstName: 'Workflow', lastName: 'Owner', email: data.email, password: data.password,
    } });
    expect(registration.status()).toBe(201);
    const auth = await registration.json();
    const headers = { Authorization: `Bearer ${auth.accessToken}` };
    const templates = [];
    for (const name of ['สายงานมาตรฐาน', 'สายงานทางเลือก']) {
      const result = await request.post(`${apiUrl}/workflows/templates`, { headers, data: {
        name, steps: [{ title: 'ตรวจเอกสาร', role: 'OWNER', durationDays: 1 }],
      } });
      expect(result.status()).toBe(201);
      templates.push(await result.json());
    }
    expect((await request.patch(`${apiUrl}/workflows/templates/${templates[0].id}`, {
      headers, data: { isDefault: null },
    })).status()).toBe(400);
    const legalCase = await data.db.case.create({ data: {
      firmId: auth.user.firmId, ownRef: data.tag, folderId: data.tag, title: `คดีสายงาน ${data.tag}`, leadLawyerId: auth.user.id,
    } });
    const origin = `http://${auth.user.firmSlug}.localhost:3005`;
    const hash = new URLSearchParams({ access_token: auth.accessToken, refresh_token: auth.refreshToken,
      next: '/workflows?tab=templates', locale: 'th' });
    await page.goto(`${origin}/handoff#${hash}`);
    await page.getByRole('button', { name: 'ตั้งเป็นค่าเริ่มต้น สายงานมาตรฐาน', exact: true }).click();
    await expect(page.getByText('ค่าเริ่มต้นของสำนักงาน', { exact: true })).toHaveCount(1);
    await page.reload();
    await expect(page.getByRole('button', { name: 'ยกเลิกค่าเริ่มต้น สายงานมาตรฐาน', exact: true })).toBeVisible();
    await page.route('**/workflows/templates/*', route => route.request().method() === 'PATCH'
      ? route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"ตั้งค่าไม่สำเร็จ ลองอีกครั้ง"}' })
      : route.continue(), { times: 1 });
    await page.getByRole('button', { name: 'ตั้งเป็นค่าเริ่มต้น สายงานทางเลือก', exact: true }).click();
    await expect(page.locator('main [role="alert"]')).toContainText('ตั้งค่าไม่สำเร็จ');
    await expect(page.getByRole('button', { name: 'ยกเลิกค่าเริ่มต้น สายงานมาตรฐาน', exact: true })).toBeVisible();
    await page.goto(`${origin}/cases/${legalCase.id}?tab=tasks`);
    await page.setViewportSize({ width: 375, height: 900 });
    await page.getByRole('button', { name: 'เริ่มสายงาน', exact: true }).click();
    const drawer = page.getByRole('dialog', { name: 'เริ่มสายงาน', exact: true });
    await expect(drawer.getByLabel('แม่แบบ', { exact: true })).toHaveValue(templates[0].id);
    await expect(drawer.getByLabel('ผู้รับขั้นที่ 1', { exact: true })).toHaveValue(auth.user.id);
    expect(await data.db.workflowRun.count({ where: { caseId: legalCase.id } })).toBe(0);
    expect(await drawer.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
    await drawer.getByLabel('แม่แบบ', { exact: true }).selectOption(templates[1].id);
    await expect(drawer.getByRole('textbox', { name: 'ชื่อสายงาน', exact: true })).toHaveValue(templates[1].name);
    await drawer.getByRole('button', { name: 'ยกเลิก', exact: true }).click();

    const ownUser = await data.db.user.findUniqueOrThrow({ where: { id: auth.user.id } });
    const staff = await data.db.user.create({ data: { email: `${data.tag}-staff@example.test`,
      passwordHash: ownUser.passwordHash, firstName: 'Staff', lastName: 'Test', role: 'LAWYER',
      firmMembers: { create: { firmId: auth.user.firmId, role: 'LAWYER' } },
    } });
    const staffSession = await (await request.post(`${apiUrl}/auth/login`, { data: { email: staff.email, password: data.password } })).json();
    expect((await request.patch(`${apiUrl}/workflows/templates/${templates[0].id}`, {
      headers: { Authorization: `Bearer ${staffSession.accessToken}` }, data: { isDefault: true },
    })).status()).toBe(403);

    const otherFirm = await data.db.firm.create({ data: { name: `E2E ${data.tag}-other`, slug: `${data.tag}-other`, trialEndAt: new Date(Date.now() + 86400000) } });
    const foreign = await data.db.workflowTemplate.create({ data: {
      firmId: otherFirm.id, createdById: auth.user.id, name: 'Foreign template', steps: templates[0].steps,
    } });
    expect((await request.patch(`${apiUrl}/workflows/templates/${foreign.id}`, { headers, data: { isDefault: true } })).status()).toBe(404);
    const replacements = await Promise.all(templates.map(t => request.patch(`${apiUrl}/workflows/templates/${t.id}`, { headers, data: { isDefault: true } })));
    expect(replacements.map(r => r.status())).toEqual([200, 200]);
    const defaults = await data.db.workflowTemplate.findMany({ where: { firmId: auth.user.firmId, isDefault: true, isActive: true } });
    expect(defaults).toHaveLength(1);
    expect((await request.delete(`${apiUrl}/workflows/templates/${defaults[0].id}`, { headers })).status()).toBe(200);
    expect(await data.db.workflowTemplate.count({ where: { firmId: auth.user.firmId, isDefault: true } })).toBe(0);
  } finally { await data.cleanup(); }
});

for (const route of routes) {
  test(`owner can open ${route} without runtime or server errors`, async ({ page }) => {
    const failures: string[] = [];
    page.on('pageerror', e => failures.push(e.message));
    page.on('response', r => { if (r.status() >= 500) failures.push(`${r.status()} ${new URL(r.url()).pathname}`); });
    await page.goto(route);
    await expect(page.locator('main')).toBeVisible();
    await page.waitForLoadState('networkidle');
    await expect(page).not.toHaveURL(/\/login$/);
    await expect(page.locator('main')).not.toContainText(/Application error|404|Internal Server Error/);
    expect((await page.locator('main').innerText()).trim().length).toBeGreaterThan(15);
    expect(failures).toEqual([]);
  });
}

for (const width of [320, 768, 1024]) {
  test(`every static workspace route fits ${width}px`, async ({ page }) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width, height: 900 });
    for (const route of routes) {
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('main')).toBeVisible();
      const overflow = await page.locator('main').evaluate(main => ({
        root: document.documentElement.scrollWidth - innerWidth,
        content: main.scrollWidth - main.clientWidth,
        offenders: [...main.querySelectorAll('*')].filter(el => el.getBoundingClientRect().right > main.getBoundingClientRect().right + 1)
          .slice(0, 5).map(el => ({ tag: el.tagName, classes: el.className })),
      }));
      expect(overflow.root, `${route} ${JSON.stringify(overflow)}`).toBeLessThanOrEqual(1);
      expect(overflow.content, `${route} ${JSON.stringify(overflow)}`).toBeLessThanOrEqual(1);
    }
  });
}

for (const width of [320, 375, 414, 768, 1024, 1440]) {
  test(`case tabs and stage controls fit ${width}px without sideways scrolling`, async ({ page }, testInfo) => {
    await page.goto('/cases');
    await page.getByRole('link', { name: 'Smith vs. Johnson Contract Dispute', exact: true }).click();
    await expect(page.getByTestId('case-identity')).toBeVisible();
    await page.setViewportSize({ width, height: 900 });
    const tabs = page.locator('[role="tablist"]');
    await expect.poll(() => tabs.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
    const labels = await tabs.getByRole('tab').allTextContents();
    for (let i = 0; i < labels.length; i++) {
      await tabs.getByRole('tab').nth(i).click();
      await page.waitForLoadState('networkidle');
      const overflow = await page.locator('main').evaluate(el => el.scrollWidth - el.clientWidth);
      expect(overflow, `${labels[i]} at ${width}`).toBeLessThanOrEqual(1);
    }
    await tabs.getByRole('tab').first().click();
    await page.locator('main').evaluate(el => el.scrollTop = 0);
    await page.screenshot({ path: testInfo.outputPath(`case-detail-${width}.png`), fullPage: true });
  });
}

for (const width of [320, 375, 414, 768, 1440]) {
  test(`main work screens fit ${width}px in both languages`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: 900 });
    for (const route of ['/dashboard', '/cases', '/court-schedule', '/team', '/todos']) {
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      for (const lang of ['TH', 'EN']) {
        if (width < 768) await page.locator('header button').first().click();
        await page.getByRole('button', { name: lang, exact: true }).click();
        if (width < 768) {
          await page.locator('aside').getByRole('button', { name: /^(Close menu|ปิดเมนู)$/ }).click();
          await expect(page.locator('aside')).toHaveClass(/-translate-x-full/);
          // Wait for the closing transition, not just the class change, so
          // visual evidence cannot capture a half-open drawer over the page.
          await expect.poll(async () => {
            const box = await page.locator('aside').boundingBox();
            return box ? box.x + box.width : 0;
          }).toBeLessThanOrEqual(1);
        }
        const overflow = await page.locator('main').evaluate(main => Array.from(main.querySelectorAll('*')).filter(el => el.getBoundingClientRect().right > main.getBoundingClientRect().right + 1).slice(0, 8).map(el => ({ tag: el.tagName, classes: el.className, width: Math.round(el.getBoundingClientRect().width) })));
        await testInfo.attach('overflow-diagnostics', { body: JSON.stringify({ route, lang, overflow }), contentType: 'application/json' });
        expect(await page.evaluate(() => {
          const main = document.querySelector('main')!;
          return { root: document.documentElement.scrollWidth <= innerWidth, content: main.scrollWidth <= main.clientWidth + 1 };
        }), `${route} ${lang} ${JSON.stringify(overflow)}`).toEqual({ root: true, content: true });
        await testInfo.attach(`${route.slice(1)}-${lang}-${width}`, { body: await page.screenshot({ animations: 'disabled', path: testInfo.outputPath(`${route.slice(1)}-${lang}-${width}.png`) }), contentType: 'image/png' });
      }
    }
  });
}

test('header search filters case list', async ({ page }) => {
  await page.goto('/dashboard');
  const search = page.locator('header input');
  await search.fill('E2E-NO-SUCH-CASE-2026');
  await search.press('Enter');
  await expect(page).toHaveURL(/\/cases\?search=E2E-NO-SUCH-CASE-2026$/);
  await expect(page.locator('main')).toContainText(/ไม่พบ|ไม่มี/);
});

test('compact case register exposes legal identifiers and remembers column selection', async ({ page }) => {
  await page.goto('/cases');
  await expect(page.locator('table')).toContainText('Smith vs. Johnson');
  await expect(page.getByRole('columnheader', { name: 'หมายเลขคดีดำ', exact: true })).toHaveCount(0);
  await page.getByText('คอลัมน์', { exact: true }).click();
  await page.getByLabel('หมายเลขคดีดำ / แดง', { exact: true }).check();
  await expect(page.getByRole('columnheader', { name: 'หมายเลขคดีดำ', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('columnheader', { name: 'หมายเลขคดีดำ', exact: true })).toBeVisible();
  await expect(page.locator('table').getByRole('link', { name: 'Smith vs. Johnson Contract Dispute', exact: true })).toBeVisible();
});

test('team load failure is visible and retry recovers', async ({ page }) => {
  await page.route('**/saas/members', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'E2E injected failure' }) }));
  await page.goto('/team');
  await expect(page.locator('main [role="alert"]')).toContainText('โหลดข้อมูลไม่สำเร็จ');
  await page.unroute('**/saas/members');
  await page.getByRole('button', { name: 'ลองใหม่', exact: true }).click();
  await expect(page.locator('main [role="alert"]')).toHaveCount(0);
  await expect(page.locator('table')).toContainText('Somchai');
});

test('new intake leaves initial documents for the workspace after saving', async ({ page }) => {
  await page.goto('/intake/new');
  await page.getByRole('button', { name: 'เสร็จสิ้น', exact: true }).click({ timeout: 1_000 }).catch(() => {});
  await expect(page.getByRole('heading', { name: 'เอกสารเริ่มต้น' })).toHaveCount(0);
  await expect(page.getByText('ลากไฟล์มาวางที่นี่ หรือกดเลือกไฟล์จากเครื่อง')).toHaveCount(0);
});

test('creates a payer contact in the case form and selects the new contact', async ({ page }) => {
  const payer = {
    id: 'payer-1',
    name: 'บริษัท วิริยะประกันภัย จำกัด (มหาชน)',
    type: 'COMPANY',
    notes: null,
    taxId: null,
    branch: null,
    address: null,
    billingEmail: null,
    billingPhone: null,
    contacts: [
      {
        id: 'contact-existing',
        name: 'ผู้ติดต่อเดิม',
        nickname: null,
        notes: null,
        email: null,
        phone: null,
        position: null,
        isPrimary: true,
        portalEnabled: false,
      },
    ],
    _count: { cases: 0 },
  };
  const createdContact = {
    id: 'contact-new',
    name: 'กมลวรรณ ศรีสุข',
    nickname: null,
    notes: null,
    email: 'kamonwan@example.test',
    phone: '0812345678',
    position: 'ฝ่ายสินไหมรถยนต์',
    isPrimary: false,
    portalEnabled: false,
  };

  await page.route('**/clients', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([payer]) });
      return;
    }
    await route.continue();
  });
  await page.route('**/clients/payer-1', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...payer, contacts: [...payer.contacts, createdContact] }),
    });
  });

  await page.goto('/cases/new');
  await page.getByRole('button', { name: 'เสร็จสิ้น', exact: true }).click({ timeout: 1_000 }).catch(() => {});
  await page.getByText('ผู้ว่าจ้าง / ผู้จ่ายเงิน (ถ้าต่างจากลูกความ)', { exact: true }).click();
  await page.locator('#case-customer-0').selectOption('payer-1');
  await page.getByRole('button', { name: 'เพิ่มผู้ติดต่อ' }).click();

  const dialog = page.getByRole('dialog', { name: 'เพิ่มคนติดต่อ' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('ชื่อ *', { exact: true }).fill('กมลวรรณ');
  await dialog.getByLabel('นามสกุล *', { exact: true }).fill('ศรีสุข');
  await dialog.getByLabel('ตำแหน่ง / ฝ่าย', { exact: true }).fill('ฝ่ายสินไหมรถยนต์');
  await dialog.getByLabel('เบอร์โทร', { exact: true }).fill('0812345678');
  await dialog.getByLabel('อีเมล', { exact: true }).fill('kamonwan@example.test');
  await dialog.getByRole('button', { name: 'บันทึกและเลือกคนนี้' }).click();

  const contactSelect = page.getByLabel('ผู้ติดต่อผู้ว่าจ้างรายที่ 1');
  await expect(dialog).toHaveCount(0);
  await expect(contactSelect).toHaveValue('contact-new');
  await expect(contactSelect.locator('option:checked')).toHaveText('กมลวรรณ ศรีสุข');
});
