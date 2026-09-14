import { test, expect, Page, APIRequestContext } from '@playwright/test';
import { createHash } from 'node:crypto';
import { localTestData } from '../helpers/test-data';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
const API = process.env.E2E_API_URL ?? 'http://localhost:3001';

async function fixture(request: APIRequestContext) {
  const data = localTestData();
  const folder = await mkdtemp(path.join(tmpdir(), 'court-day-'));
  try {
    const registration = await request.post(`${API}/auth/register`, {
      data: {
        firmName: data.firmName,
        firstName: 'Court',
        lastName: 'Lawyer',
        email: data.email,
        password: data.password,
      },
    });
    expect(registration.status()).toBe(201);
    const auth = await registration.json();
    const headers = { Authorization: `Bearer ${auth.accessToken}` };
    const legalCase = await data.db.case.create({
      data: {
        firmId: auth.user.firmId,
        ownRef: data.tag,
        folderId: data.tag,
        title: `คดีทดสอบแฟ้มศาล ${data.tag}`,
        leadLawyerId: auth.user.id,
        courtName: 'ศาลทดสอบ',
      },
    });
    const now = Date.now();
    // Today, already started, so it is both on My Day and recordable.
    const event = await data.db.calendarEvent.create({
      data: {
        caseId: legalCase.id,
        title: `นัดศาล ${data.tag}`,
        courtName: 'ศาลทดสอบ',
        type: 'COURT_DATE',
        startAt: new Date(now - 60000),
        assigneeId: auth.user.id,
        reminderMinutes: [],
      },
    });
    const tomorrow = await data.db.calendarEvent.create({
      data: {
        caseId: legalCase.id,
        title: `นัดพรุ่งนี้ ${data.tag}`,
        type: 'COURT_DATE',
        startAt: new Date(now + 86400000),
        reminderMinutes: [],
      },
    });
    const task = await data.db.task.create({
      data: {
        caseId: legalCase.id,
        title: 'ตรวจสำเนาหลักฐาน',
        createdById: auth.user.id,
        assigneeId: auth.user.id,
      },
    });
    const file = path.join(folder, 'court-notes.txt');
    await writeFile(file, 'Verified court preparation document v1');
    const doc = await data.db.document.create({
      data: {
        caseId: legalCase.id,
        filename: 'เอกสารเตรียมศาล.txt',
        mimeType: 'text/plain',
        storagePath: file,
        uploadedById: auth.user.id,
        versions: {
          create: {
            version: 1,
            filename: 'เอกสารเตรียมศาล.txt',
            mimeType: 'text/plain',
            storagePath: file,
            createdById: auth.user.id,
          },
        },
      },
    });
    const origin = `http://${auth.user.firmSlug}.localhost:3005`;
    return {
      ...data,
      auth,
      headers,
      legalCase,
      event,
      tomorrow,
      task,
      doc,
      origin,
      async open(page: Page, next = '/my-day', locale = 'th') {
        const hash = new URLSearchParams({
          access_token: auth.accessToken,
          refresh_token: auth.refreshToken,
          next,
          locale,
        });
        await page.goto(`${origin}/handoff#${hash}`);
        await expect(page).toHaveURL(`${origin}${next}`);
      },
      async cleanup() {
        await data.cleanup();
        await rm(folder, { recursive: true, force: true });
      },
    };
  } catch (err) {
    await data.cleanup();
    await rm(folder, { recursive: true, force: true });
    throw err;
  }
}

async function prepare(page: Page, f: Awaited<ReturnType<typeof fixture>>) {
  await f.open(page, `/court-day/${f.event.id}`, 'en');
  await page.getByRole('button', { name: 'Use suggested checklist', exact: true }).click();
  await page.getByRole('checkbox', { name: /เอกสารเตรียมศาล.txt/ }).check();
  await page.getByRole('button', { name: 'Save preparation', exact: true }).click();
  await expect(page.locator('footer [role="status"]')).toHaveText('Saved');
  await page.getByRole('button', { name: 'Save an offline pack', exact: true }).click();
  await page.getByRole('link', { name: 'Open offline pack →', exact: true }).click();
  await expect(page.locator('#content')).toBeVisible();
  return page.url();
}
async function pack(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('samnuan-court-offline', 1); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    try { return await new Promise<any>((resolve, reject) => { const r = db.transaction('packs').objectStore('packs').getAll(); r.onsuccess = () => resolve(r.result[0]); r.onerror = () => reject(r.error); }); } finally { db.close(); }
  });
}

test('offline pack reloads without network, verifies file bytes, persists edits across tabs and syncs once', async ({ page, context, request }, testInfo) => {
  const f = await fixture(request);
  try {
    await page.setViewportSize({ width: 375, height: 850 });
    const url = await prepare(page, f);
    const initial = await pack(page);
    expect(initial.files).toHaveLength(1);
    expect(initial.files[0].hash).toBe(createHash('sha256').update('Verified court preparation document v1').digest('hex'));
    await context.setOffline(true);
    await page.reload();
    expect(await page.evaluate(async () => { try { await fetch('/offline-network-probe', { cache: 'no-store' }); return false; } catch { return true; } })).toBe(true);
    await expect(page.locator('#content')).toBeVisible();
    const downloading = page.waitForEvent('download');
    await page.locator('#files button').click();
    const download = await downloading;
    expect(await readFile((await download.path())!, 'utf8')).toBe('Verified court preparation document v1');
    await page.locator('#notes').fill('Offline preparation notes');
    await page.locator('#outcome').fill('Offline hearing outcome');
    await page.locator('#checklist input').first().check();
    await page.locator('#save').click();
    await expect.poll(async () => (await pack(page)).state.outcome).toBe('Offline hearing outcome');
    await page.reload();
    await expect(page.locator('#notes')).toHaveValue('Offline preparation notes');
    await expect(page.locator('#checklist input').first()).toBeChecked();
    const second = await context.newPage();
    await second.goto(url);
    await expect(second.locator('#outcome')).toHaveValue('Offline hearing outcome');
    await second.close();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath('court-offline-mobile.png'), fullPage: true });
    await context.setOffline(false);
    await page.locator('#sync').click();
    await expect.poll(async () => (await pack(page)).status).toBe('synced');
    const saved = await f.db.courtDay.findUniqueOrThrow({ where: { eventId: f.event.id } });
    expect(saved.state).toEqual(expect.objectContaining({ notes: 'Offline preparation notes', outcome: 'Offline hearing outcome' }));
    await page.locator('#sync').click();
    await expect(page.locator('#sync')).toBeEnabled();
    expect((await f.db.courtDay.findUniqueOrThrow({ where: { eventId: f.event.id } })).version).toBe(saved.version);
    expect(await f.db.caseActivity.count({ where: { caseId: f.legalCase.id } })).toBe(0);
    await page.locator('#back').click();
    await page.getByRole('button', { name: 'Open menu', exact: true }).click();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect.poll(() => page.evaluate(() => localStorage.getItem('lawfirm_access_token'))).toBeNull();
    expect(await page.evaluate(() => localStorage.getItem('samnuan:offline-identity'))).toBeNull();
    await expect.poll(() => pack(page)).toBeUndefined();
    await page.goto(url);
    await expect(page.locator('#content')).toBeHidden();
  } finally { await context.setOffline(false); await f.cleanup(); }
});

test('offline sync retains a conflict draft and lost-response retry does not increment twice', async ({ page, request }) => {
  const f = await fixture(request);
  try {
    await prepare(page, f);
    await page.locator('#notes').fill('Lost response notes');
    await page.locator('#save').click();
    await expect.poll(async () => (await pack(page)).state.notes).toBe('Lost response notes');
    await page.route('**/court-day', async route => { if (route.request().method() === 'PATCH') { await route.fetch(); await route.abort('failed'); } else await route.continue(); });
    await page.locator('#sync').click();
    await expect.poll(async () => (await pack(page)).status).toBe('failed');
    const committed = await f.db.courtDay.findUniqueOrThrow({ where: { eventId: f.event.id } });
    await page.unroute('**/court-day');
    await page.locator('#sync').click();
    await expect.poll(async () => (await pack(page)).status).toBe('synced');
    expect((await f.db.courtDay.findUniqueOrThrow({ where: { eventId: f.event.id } })).version).toBe(committed.version);
    await page.locator('#notes').fill('Keep this local conflict draft');
    await page.locator('#save').click();
    await expect.poll(async () => (await pack(page)).state.notes).toBe('Keep this local conflict draft');
    const changed = await request.patch(`${API}/calendar/events/${f.event.id}/court-day`, { headers: f.headers, data: { version: committed.version, state: { ...(committed.state as object), notes: 'Colleague server edit' } } });
    expect(changed.ok(), await changed.text()).toBe(true);
    await page.locator('#sync').click();
    await expect.poll(async () => (await pack(page)).status).toBe('conflict');
    await page.reload();
    await expect(page.locator('#notes')).toHaveValue('Keep this local conflict draft');
    expect((await f.db.courtDay.findUniqueOrThrow({ where: { eventId: f.event.id } })).state).toEqual(expect.objectContaining({ notes: 'Colleague server edit' }));
  } finally { await f.cleanup(); }
});
