import { test, expect } from '../helpers/tenant-test';

const routes = [
  '/dashboard', '/my-day', '/todos', '/intake', '/intake/new', '/cases', '/cases/new',
  '/clients', '/clients/new', '/court-schedule', '/calendar', '/documents', '/operations',
  '/expenses', '/expenses/new', '/team', '/settings', '/reports', '/email-intake',
  '/intake/portal-submissions', '/admin/courts', '/admin/case-types', '/admin/deadline-rules',
  '/admin/holidays', '/admin/reimbursements', '/account/billing', '/knowledge', '/admin/users', '/admin/users/new',
];

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

for (const width of [375, 1440]) {
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
        await testInfo.attach(`${route.slice(1)}-${lang}-${width}`, { body: await page.screenshot({ path: testInfo.outputPath(`${route.slice(1)}-${lang}-${width}.png`) }), contentType: 'image/png' });
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

test('team load failure is visible and retry recovers', async ({ page }) => {
  await page.route('**/saas/members', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'E2E injected failure' }) }));
  await page.goto('/team');
  await expect(page.locator('main [role="alert"]')).toContainText('โหลดข้อมูลไม่สำเร็จ');
  await page.unroute('**/saas/members');
  await page.getByRole('button', { name: 'ลองใหม่', exact: true }).click();
  await expect(page.locator('main [role="alert"]')).toHaveCount(0);
  await expect(page.locator('table')).toContainText('Somchai');
});
