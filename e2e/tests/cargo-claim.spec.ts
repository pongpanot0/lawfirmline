import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const tenant = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../.auth/tenant.json'), 'utf8'),
) as { origin: string };

test('direct Case can open the Cargo workbench with 16 source-linkable requirements', async ({ page }) => {
  await page.goto(`${tenant.origin}/cases/6e44f682-08b7-4c9a-b524-2d96b8c431f4`);
  const closeTour = page.getByRole('button', { name: 'ปิดคำแนะนำ' });
  if (await closeTour.waitFor({ state: 'visible', timeout: 3_000 }).then(() => true).catch(() => false)) await closeTour.click();
  await expect(page.locator('nav[aria-label="พื้นที่ทำงานคดี"]')).toHaveCSS('position', 'static');
  await expect(page.getByText('หมายเลขคดีดำ', { exact: true })).toBeVisible();
  await expect(page.getByText('หมายเลขคดีแดง', { exact: true })).toBeVisible();
  const caseInformation = page.getByTestId('case-information');
  await expect(caseInformation.getByText('คู่ความ / Participants')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'รายการงานคดี' })).toBeVisible();
  await page.getByRole('button', { name: 'เพิ่มคู่ความ' }).click();
  const participantRole = page.getByLabel('บทบาท / Role');
  await expect(participantRole.locator('option[value="JOINT_PLAINTIFF"]')).toHaveText('โจทก์ร่วม');
  await expect(participantRole.locator('option[value="JOINT_DEFENDANT"]')).toHaveText('จำเลยร่วม');
  await expect(participantRole.locator('option[value="RESPONDENT"]')).toHaveText('ผู้คัดค้าน');
  await page.getByRole('button', { name: 'ยกเลิก' }).click();
  await expect(page.getByRole('tab', { name: 'Cargo Claim' })).toBeVisible();
  await page.getByRole('tab', { name: 'Cargo Claim' }).click();

  const enable = page.getByRole('button', { name: 'เปิด Cargo Claim' });
  if (await enable.waitFor({ state: 'visible', timeout: 3_000 }).then(() => true).catch(() => false)) await enable.click();

  const adoptPlaybook = page.getByRole('button', { name: 'ผูก Cargo Playbook' });
  if (await adoptPlaybook.waitFor({ state: 'visible', timeout: 3_000 }).then(() => true).catch(() => false)) await adoptPlaybook.click();

  await expect(page.getByRole('heading', { name: 'Cargo Claim Workbench' })).toBeVisible();
  await expect(page.getByText('Playbook: Cargo Claim Assessment · v1')).toBeVisible();
  await page.getByRole('tab', { name: /เอกสาร 16 รายการ/ }).click();
  await expect(page.getByTestId('cargo-requirement')).toHaveCount(16);
  await expect(page.getByText('Bill of Lading / HAWB / MAWB')).toBeVisible();

  await page.getByRole('tab', { name: 'Liability / Time Bar' }).click();
  await expect(page.getByText(/ต้องมีแหล่งอ้างอิงและทนายกดยืนยัน/)).toBeVisible();
  await expect(page.getByRole('button', { name: /ยืนยันโดยทนาย/ })).toBeVisible();

  await page.goto(`${tenant.origin}/playbooks`);
  await expect(page.getByText(/Cargo Claim Assessment · v1/)).toBeVisible();
  await expect(page.getByText('Cargo · 16 docs')).toBeVisible();
});

test('new Intake and new Case expose both Cargo entry paths', async ({ page }) => {
  await page.goto(`${tenant.origin}/intake/new`);
  await expect(page.getByLabel('ลักษณะงานก่อนฟ้อง')).toBeVisible();
  await page.getByLabel('ลักษณะงานก่อนฟ้อง').selectOption('TRANSPORT');
  await expect(page.getByRole('heading', { name: 'ข้อเท็จจริง Cargo Claim' })).toBeVisible();

  await page.goto(`${tenant.origin}/cases/new`);
  await expect(page.getByText('คดีเรียกร้องค่าสินค้าจากการขนส่ง (Cargo Claim)')).toBeVisible();
});
