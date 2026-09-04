import { test, expect, Page, Locator } from '@playwright/test';

/**
 * Form-validation coverage for the numeric / formatted text fields that used to
 * accept anything: expense amounts, estimated fee, Thai case numbers, phone.
 * Each test drives the real form and asserts the field reports itself invalid
 * (native constraint validation) so the browser blocks submission.
 */

const API = process.env.E2E_API_URL ?? 'http://localhost:3001';

async function invalid(input: Locator) {
  return input.evaluate((el: HTMLInputElement) => !el.checkValidity());
}

async function goto(page: Page, route: string) {
  await page.goto(route);
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(400);
}

async function adminToken(page: Page) {
  const res = await page.request.post(`${API}/auth/login`, {
    data: { email: 'admin@lawfirm.com', password: 'password123' },
  });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).accessToken as string;
}

test.describe('ยอดเงินค่าใช้จ่าย (Expense amount)', () => {
  test('ปฏิเสธยอดติดลบและศูนย์ที่หน้า /expenses', async ({ page }) => {
    await goto(page, '/expenses');
    await page.click('button:has-text("New Expense")');
    const amount = page.locator('form input[type="number"]').first();

    await amount.fill('-500');
    expect(await invalid(amount)).toBe(true);

    await amount.fill('0');
    expect(await invalid(amount)).toBe(true);

    await amount.fill('1500.50');
    expect(await invalid(amount)).toBe(false);
  });

  test('ปฏิเสธทศนิยมเกิน 2 ตำแหน่ง', async ({ page }) => {
    await goto(page, '/expenses');
    await page.click('button:has-text("New Expense")');
    const amount = page.locator('form input[type="number"]').first();
    await amount.fill('10.999');
    expect(await invalid(amount)).toBe(true);
  });

  test('API ปฏิเสธยอดติดลบ', async ({ page }) => {
    const token = await adminToken(page);
    const res = await page.request.post(`${API}/expenses`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { amount: -1000, description: 'negative amount should fail' },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
  });

  test('API ปฏิเสธคำอธิบายว่าง', async ({ page }) => {
    const token = await adminToken(page);
    const res = await page.request.post(`${API}/expenses`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { amount: 100, description: '   ' },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
  });
});

test.describe('เลขคดีและรายได้โดยประมาณ (/cases/new)', () => {
  async function openStep2(page: Page) {
    await goto(page, '/cases/new');
    await page.click('main button:has-text("Litigation")');
    await page.click('button:has-text("Next")');
    await page.waitForTimeout(400);
  }

  test('เลขดำต้องอยู่ในรูปแบบ เลขที่/ปีพ.ศ.', async ({ page }) => {
    await openStep2(page);
    const black = page.locator('input[placeholder="เช่น 123/2567"]');

    await black.fill('abc');
    expect(await invalid(black)).toBe(true);

    await black.fill('123-2567');
    expect(await invalid(black)).toBe(true);

    await black.fill('123/2567');
    expect(await invalid(black)).toBe(false);
  });

  test('เลขแดงต้องอยู่ในรูปแบบ เลขที่/ปีพ.ศ.', async ({ page }) => {
    await openStep2(page);
    const red = page.locator('input[placeholder="เช่น 456/2567"]');

    await red.fill('ไม่ใช่ตัวเลข');
    expect(await invalid(red)).toBe(true);

    await red.fill('456/2567');
    expect(await invalid(red)).toBe(false);
  });

  test('รายได้โดยประมาณห้ามติดลบ', async ({ page }) => {
    await openStep2(page);
    const fee = page.locator('input[type="number"]').first();

    await fee.fill('-1');
    expect(await invalid(fee)).toBe(true);

    await fee.fill('50000');
    expect(await invalid(fee)).toBe(false);
  });
});

test.describe('เบอร์โทรผู้ติดต่อ (/clients/new)', () => {
  test('เบอร์โทรต้องเป็นตัวเลข', async ({ page }) => {
    await goto(page, '/clients/new');
    const phone = page.locator('input[placeholder*="Phone"]').first();

    await phone.fill('ไม่ใช่เบอร์');
    expect(await invalid(phone)).toBe(true);

    await phone.fill('abcdefghij');
    expect(await invalid(phone)).toBe(true);

    await phone.fill('081-234-5678');
    expect(await invalid(phone)).toBe(false);

    await phone.fill('0812345678');
    expect(await invalid(phone)).toBe(false);
  });

  test('API ปฏิเสธเบอร์โทรที่ไม่ใช่ตัวเลข', async ({ page }) => {
    const token = await adminToken(page);
    const res = await page.request.post(`${API}/clients`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        name: 'E2E invalid phone client',
        contacts: [{ name: 'Somchai', phone: 'not-a-phone', isPrimary: true }],
      },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
  });
});

test.describe('บันทึกเวลาทำงาน (time entries)', () => {
  test('API ปฏิเสธชั่วโมงติดลบและเกิน 24', async ({ page }) => {
    const token = await adminToken(page);
    const cases = await (
      await page.request.get(`${API}/cases`, { headers: { Authorization: `Bearer ${token}` } })
    ).json();
    const caseId = (Array.isArray(cases) ? cases : cases.data)?.[0]?.id;
    test.skip(!caseId, 'no case available');

    for (const hours of [-2, 25]) {
      const res = await page.request.post(`${API}/cases/${caseId}/billing/time-entries`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { hours, description: 'invalid hours' },
        failOnStatusCode: false,
      });
      expect(res.status(), `hours=${hours} should be rejected`).toBe(400);
    }
  });
});
