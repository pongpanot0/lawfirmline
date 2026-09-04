import { test, expect, Page } from '@playwright/test';
import {
  maskEmail,
  maskName,
  maskNationalId,
  maskPhone,
  maskPiiObject,
  maskPiiText,
  PII_TEXT_PATTERNS,
} from '@lawfirm/shared';
import { maskPii } from '../helpers/annotate';

/**
 * PII coverage, three layers:
 *   1. the masking helpers themselves,
 *   2. what the API hands out (tenant + portal isolation, no enumeration,
 *      no secrets in payloads),
 *   3. what the shipped user-guide screenshots would show.
 */

const API = process.env.E2E_API_URL ?? 'http://localhost:3001';
const PORTAL_CONTACT_EMAIL = 'john.smith@email.com';

/** Regexes are `g`-flagged and stateful — always test against a fresh copy. */
const rawEmail = () => new RegExp(PII_TEXT_PATTERNS.email.source);

async function adminToken(page: Page) {
  const res = await page.request.post(`${API}/auth/login`, {
    data: { email: 'admin@lawfirm.com', password: 'password123' },
  });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).accessToken as string;
}

test.describe('ตัวช่วย mask PII', () => {
  test('อีเมลเหลือแค่ตัวหัว-ท้าย', () => {
    expect(maskEmail('john.smith@email.com')).toBe('j***h@e***l.com');
    expect(maskEmail('a@b.co')).toBe('a*@b*.co');
    expect(maskEmail('')).toBe('');
    expect(maskEmail(null)).toBe('');
  });

  test('เบอร์โทรและเลขบัตรเหลือ 4 ตัวท้าย', () => {
    expect(maskPhone('081-234-5678')).toBe('******5678');
    expect(maskPhone('+66 81 234 5678')).toBe('*******5678');
    expect(maskNationalId('1-2345-67890-12-3')).toBe('*********0123');
  });

  test('ชื่อคนถูกย่อ', () => {
    expect(maskName('สมชาย ใจดี')).toBe('ส*** ใ***');
    expect(maskName('John Smith')).toBe('J*** S***');
  });

  test('maskPiiObject ปิดบังคีย์ PII และลบ secret ทิ้ง', () => {
    const masked = maskPiiObject({
      email: 'john.smith@email.com',
      phone: '0812345678',
      accessToken: 'super-secret-jwt',
      password: 'password123',
      role: 'OWNER',
      nested: { contactEmail: 'ceo@abc.com', count: 3 },
    });

    expect(masked.email).toBe('j***h@e***l.com');
    expect(masked.phone).toBe('******5678');
    expect(masked.accessToken).toBe('[redacted]');
    expect(masked.password).toBe('[redacted]');
    expect(masked.role).toBe('OWNER'); // non-PII passes through untouched
    expect(masked.nested.contactEmail).toBe('c***o@a***c.com');
    expect(masked.nested.count).toBe(3);
  });

  test('maskPiiText ล้าง PII ในข้อความอิสระ', () => {
    const out = maskPiiText('ส่งลิงก์ไปที่ john.smith@email.com แล้วโทร 081-234-5678');
    expect(out).not.toContain('john.smith@email.com');
    expect(out).not.toContain('081-234-5678');
    expect(out).toContain('j***h@e***l.com');
  });
});

test.describe('API ไม่ปล่อย PII และแยก tenant', () => {
  test('ตอบ 401 โดยไม่บอกว่าอีเมลมีอยู่จริงหรือไม่', async ({ page }) => {
    const known = await page.request.post(`${API}/auth/login`, {
      data: { email: 'admin@lawfirm.com', password: 'wrong-password' },
      failOnStatusCode: false,
    });
    const unknown = await page.request.post(`${API}/auth/login`, {
      data: { email: 'nobody-here@example.com', password: 'wrong-password' },
      failOnStatusCode: false,
    });

    expect(known.status()).toBe(unknown.status());
    expect(await known.text()).toBe(await unknown.text());
    expect(await known.text()).not.toContain('admin@lawfirm.com');
  });

  test('ขอ magic link ตอบเหมือนกันทั้งอีเมลที่มีและไม่มี', async ({ page }) => {
    const strip = async (email: string) => {
      const res = await page.request.post(`${API}/client-portal/auth/request-link`, {
        data: { email },
        failOnStatusCode: false,
      });
      const body = await res.json();
      // linkToken only exists behind CLIENT_PORTAL_EXPOSE_DEV_TOKEN in dev
      delete body.linkToken;
      return { status: res.status(), body };
    };

    const known = await strip(PORTAL_CONTACT_EMAIL);
    const unknown = await strip('definitely-not-a-contact@example.com');
    expect(known).toEqual(unknown);
  });

  test('/auth/me ไม่ส่ง passwordHash หรือ token กลับมา', async ({ page }) => {
    const token = await adminToken(page);
    const res = await page.request.get(`${API}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.text();
    expect(body).not.toContain('passwordHash');
    expect(body).not.toContain('$2b$');
    expect(body).not.toContain('refreshToken');
  });

  test('เจ้าของสำนักงานอื่นเปิดคดีของเราไม่ได้', async ({ page }) => {
    const token = await adminToken(page);
    const cases = await (
      await page.request.get(`${API}/cases`, { headers: { Authorization: `Bearer ${token}` } })
    ).json();
    const ourCaseId = (Array.isArray(cases) ? cases : cases.data)?.[0]?.id;
    test.skip(!ourCaseId, 'no case available');

    // A brand-new firm — its owner must not see anything of the seeded firm.
    const outsiderEmail = `pii-outsider-${Date.now()}@example.com`;
    const register = await page.request.post(`${API}/auth/register`, {
      data: {
        email: outsiderEmail,
        password: 'password123',
        firstName: 'Pii',
        lastName: 'Outsider',
        firmName: 'PII Outsider Firm',
      },
      failOnStatusCode: false,
    });
    test.skip(!register.ok(), `register failed: ${register.status()}`);
    const outsiderToken = (await register.json()).accessToken as string;

    const res = await page.request.get(`${API}/cases/${ourCaseId}`, {
      headers: { Authorization: `Bearer ${outsiderToken}` },
      failOnStatusCode: false,
    });
    expect([403, 404]).toContain(res.status());
    expect(await res.text()).not.toContain('John Smith');

    const clients = await page.request.get(`${API}/clients`, {
      headers: { Authorization: `Bearer ${outsiderToken}` },
    });
    expect(await clients.text()).not.toContain('@email.com');
  });
});

test.describe('Client Portal เห็นเฉพาะข้อมูลของตัวเอง', () => {
  async function portalToken(page: Page) {
    const req = await page.request.post(`${API}/client-portal/auth/request-link`, {
      data: { email: PORTAL_CONTACT_EMAIL },
    });
    const { linkToken } = await req.json();
    if (!linkToken) return null; // CLIENT_PORTAL_EXPOSE_DEV_TOKEN is off
    const verify = await page.request.post(`${API}/client-portal/auth/verify`, {
      data: { token: linkToken },
    });
    expect(verify.ok()).toBeTruthy();
    return (await verify.json()).accessToken as string;
  }

  test('ลูกค้าเปิดคดีของลูกค้ารายอื่นไม่ได้ และไม่เห็นอีเมลผู้ติดต่อคนอื่น', async ({ page }) => {
    const token = await portalToken(page);
    test.skip(!token, 'CLIENT_PORTAL_EXPOSE_DEV_TOKEN is not enabled');

    const admin = await adminToken(page);
    const all = await (
      await page.request.get(`${API}/cases`, { headers: { Authorization: `Bearer ${admin}` } })
    ).json();
    const allCases = Array.isArray(all) ? all : all.data;

    const mine = await (
      await page.request.get(`${API}/client-portal/cases`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).json();
    const mineIds = new Set(mine.map((c: { id: string }) => c.id));
    const otherCase = allCases.find((c: { id: string }) => !mineIds.has(c.id));
    test.skip(!otherCase, 'no case belonging to another client');

    const res = await page.request.get(`${API}/client-portal/cases/${otherCase.id}`, {
      headers: { Authorization: `Bearer ${token}` },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(404);

    // Nothing the portal returns may carry a second person's identifiers.
    const me = await page.request.get(`${API}/client-portal/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await me.text();
    expect(body).not.toContain('jane.smith@email.com');
    expect(body).not.toContain('ceo@abc.com');
    expect(body).not.toContain('phone');
  });
});

test.describe('ภาพในคู่มือไม่มี PII', () => {
  // The login screen only renders for a signed-out visitor.
  test.describe('ก่อนเข้าสู่ระบบ', () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test('maskPii ลบอีเมลและเบอร์โทรออกจากหน้าจอก่อนถ่ายภาพ', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle').catch(() => {});

    // The login screen lists demo accounts — real addresses before masking.
    expect(await page.locator('body').innerText()).toContain('admin@lawfirm.com');

    await maskPii(page);

    const text = await page.locator('body').innerText();
    expect(text).not.toContain('admin@lawfirm.com');
      expect(text).toContain('a***n@l***m.com');
      expect(text).not.toMatch(rawEmail());
    });
  });

  test('หน้าลูกค้าไม่เหลืออีเมล/เบอร์โทรจริงหลัง mask', async ({ page }) => {
    await page.goto('/clients');
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(800);

    await maskPii(page);

    const text = await page.locator('body').innerText();
    expect(text).not.toMatch(rawEmail());
    expect(text).not.toMatch(/\b0\d{2}-\d{3}-\d{4}\b/);
  });
});
