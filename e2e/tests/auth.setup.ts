import { test as setup, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { capture, resetManifest } from '../helpers/annotate';

const ADMIN_STATE = path.resolve(__dirname, '../.auth/admin.json');

export const ADMIN = { email: 'admin@lawfirm.com', password: 'password123' };

setup('login as admin and capture the login screen', async ({ page }) => {
  resetManifest();

  await page.goto('/login');
  await expect(page.getByRole('heading', { name: /เข้าสู่ระบบ|sign in/i })).toBeVisible();

  await capture(page, {
    id: '01-login',
    title: 'หน้าเข้าสู่ระบบ (Login)',
    route: '/login',
    description:
      'เริ่มต้นใช้งานที่หน้านี้ กรอกอีเมลและรหัสผ่านของบัญชีสำนักงาน แล้วกดเข้าสู่ระบบ ระบบจะพาเข้าสู่ Dashboard',
    callouts: [
      { selector: 'input[type="email"]', label: 'กรอกอีเมลผู้ใช้', place: 'right' },
      { selector: 'input[type="password"]', label: 'กรอกรหัสผ่าน', place: 'right' },
      { selector: 'button[type="submit"]', label: 'กดเพื่อเข้าสู่ระบบ', place: 'right' },
      { selector: 'a[href="/forgot-password"]', label: 'ลืมรหัสผ่าน กดที่นี่', place: 'right' },
    ],
  });

  await page.fill('input[type="email"]', ADMIN.email);
  await page.fill('input[type="password"]', ADMIN.password);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 30_000 });

  fs.mkdirSync(path.dirname(ADMIN_STATE), { recursive: true });
  await page.context().storageState({ path: ADMIN_STATE });
});
