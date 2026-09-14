import { test, expect, Page, APIRequestContext } from '@playwright/test';
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

test('court day: prepare from My Day → download → record → follow-up + draft; replay creates no duplicates', async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(150_000);
  const f = await fixture(request);
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  try {
    await f.open(page);
    await page
      .locator('main')
      .getByRole('link')
      .filter({ hasText: `นัดศาล ${f.tag}` })
      .click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      `นัดศาล ${f.tag}`,
    );
    await page.getByRole('button', { name: 'ใช้รายการแนะนำ' }).click();
    await page
      .getByLabel('ตรวจวัน เวลา และสถานที่นัด', { exact: true })
      .check();
    await page
      .getByLabel('สิ่งที่ต้องเตรียม', { exact: true })
      .fill('นำต้นฉบับหนังสือมอบอำนาจ');
    await page
      .getByRole('button', { name: 'เพิ่มรายการ', exact: true })
      .click();
    await page
      .getByLabel('บันทึกเตรียมนัด', { exact: true })
      .fill('ตรวจรายชื่อพยานกับทีมก่อนเริ่ม');
    await page.getByLabel(/ตรวจสำเนาหลักฐาน/).check();
    await page.getByLabel(/เอกสารเตรียมศาล.txtฉบับ/).check();
    await page
      .getByRole('button', { name: 'บันทึกความพร้อม', exact: true })
      .click();
    await expect(page.locator('footer [role="status"]')).toHaveText(
      'บันทึกแล้ว',
    );
    await page.reload();
    await expect(
      page.getByLabel('ตรวจวัน เวลา และสถานที่นัด', { exact: true }),
    ).toBeChecked();
    await expect(
      page.getByLabel('บันทึกเตรียมนัด', { exact: true }),
    ).toHaveValue('ตรวจรายชื่อพยานกับทีมก่อนเริ่ม');
    expect(await f.db.task.count({ where: { caseId: f.legalCase.id } })).toBe(
      1,
    );
    const secondFile = path.join(path.dirname(f.doc.storagePath), 'v2.txt');
    await writeFile(secondFile, 'New document v2, not the selected version');
    await f.db.document.update({
      where: { id: f.doc.id },
      data: {
        version: 2,
        filename: 'เอกสารแก้ไขใหม่.txt',
        storagePath: secondFile,
        versions: {
          create: {
            version: 2,
            filename: 'เอกสารแก้ไขใหม่.txt',
            storagePath: secondFile,
            mimeType: 'text/plain',
            createdById: f.auth.user.id,
          },
        },
      },
    });
    await page.reload();
    await expect(page.locator('main')).toContainText('มีฉบับใหม่');
    // The existing case action must reach the same saved appointment file.
    await page.getByRole('link', { name: 'เปิดหน้าคดี', exact: true }).click();
    await page.getByRole('button', { name: 'บันทึกผลหลังขึ้นศาล', exact: true }).click();
    await page.getByRole('dialog').getByRole('link').filter({ hasText: `นัดศาล ${f.tag}` }).click();
    await expect(page).toHaveURL(`${f.origin}/court-day/${f.event.id}`);
    await expect(page.getByLabel('ตรวจวัน เวลา และสถานที่นัด', { exact: true })).toBeChecked();
    const downloaded = page.waitForEvent('download');
    await page
      .getByRole('button', {
        name: 'ดาวน์โหลด: เอกสารเตรียมศาล.txt',
        exact: true,
      })
      .click();
    const file = await downloaded;
    expect(await readFile((await file.path())!, 'utf8')).toContain(
      'document v1',
    );
    await page.screenshot({
      path: testInfo.outputPath('court-preparation-desktop.png'),
      fullPage: true,
    });
    await page
      .getByRole('button', { name: 'บันทึกแล้วไปต่อ', exact: true })
      .click();
    await page
      .getByLabel('ผลนัดที่เกิดขึ้นจริง', { exact: true })
      .fill('ศาลให้ส่งเอกสารเพิ่มเติมก่อนนัดถัดไป');
    await page.getByLabel('มีนัดครั้งหน้า', { exact: true }).check();
    await page
      .getByLabel('ชื่อนัดครั้งหน้า', { exact: true })
      .fill('นัดตรวจเอกสารเพิ่มเติม');
    const nextDate = new Date(Date.now() + 7 * 86400000)
      .toISOString()
      .slice(0, 10);
    await page
      .getByLabel('วันและเวลานัดครั้งหน้า', { exact: true })
      .fill(`${nextDate}T09:00`);
    await page.getByLabel('สร้างงานติดตาม', { exact: true }).check();
    await page
      .getByLabel('งานที่ต้องทำต่อ', { exact: true })
      .fill('รวบรวมเอกสารเพิ่มเติม');
    await page.getByLabel('บันทึกค่าใช้จ่ายเป็นร่าง', { exact: true }).check();
    await page
      .getByLabel('ยอดจริงที่จ่าย (บาท)', { exact: true })
      .fill('250.50');
    await page
      .getByRole('button', { name: 'ตรวจรายการก่อนบันทึก', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'ตรวจงานต่อ', exact: true }),
    ).toBeVisible();
    // The server commits, but the browser loses the response. Retrying must
    // return the same recorded outcome rather than create another batch.
    await page.route('**/court-day/complete', async (route) => {
      await route.fetch();
      await route.abort('failed');
    });
    await page
      .getByRole('button', { name: 'ยืนยันบันทึกผลนัด', exact: true })
      .click();
    await expect(page.locator('main').getByRole('alert')).toContainText(
      'ข้อมูลที่กรอกยังอยู่',
    );
    await page.unroute('**/court-day/complete');
    await page
      .getByRole('button', { name: 'ยืนยันบันทึกผลนัด', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'บันทึกผลนัดเรียบร้อย' }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'บันทึกผลนัดเรียบร้อย' }),
    ).toBeVisible();
    const endpoint = `${API}/calendar/events/${f.event.id}/court-day`;
    const saved = (
      await (await request.get(endpoint, { headers: f.headers })).json()
    ).workspace;
    const repeated = await request.post(`${endpoint}/complete`, {
      headers: f.headers,
      data: {
        version: saved.version - 1,
        eventUpdatedAt: f.event.updatedAt.toISOString(),
      },
    });
    expect(repeated.ok()).toBe(true);
    expect((await repeated.json()).result).toEqual(saved.result);
    expect(
      await f.db.caseActivity.count({
        where: { caseId: f.legalCase.id, type: 'COURT_DATE' },
      }),
    ).toBe(1);
    expect(await f.db.task.count({ where: { caseId: f.legalCase.id } })).toBe(
      2,
    );
    expect(
      await f.db.calendarEvent.count({ where: { caseId: f.legalCase.id } }),
    ).toBe(3);
    const expense = await f.db.expense.findUniqueOrThrow({
      where: { id: saved.result.expenseId },
    });
    expect(expense.status).toBe('DRAFT');
    expect(expense.amount).toBe(250.5);
    expect(expense.sourceEventId).toBe(f.event.id);
    const draft = await f.db.closingEmailDraft.findUniqueOrThrow({
      where: { id: saved.result.draftId },
    });
    expect(draft.status).toBe('DRAFT');
    expect(draft.bodyText).toContain('ศาลให้ส่งเอกสารเพิ่มเติม');
    expect(draft.selectedActivityIds).toEqual([saved.result.activityId]);
    await page.getByRole('link', { name: 'เปิดตรวจร่าง' }).click();
    await expect(page.locator('main textarea')).toHaveValue(draft.bodyText);
    expect(errors).toEqual([]);
  } finally {
    await f.cleanup();
  }
});

test('court day: stale edits, lost responses, concurrent completion, future appointment and tenant boundaries', async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const f = await fixture(request);
  try {
    const endpoint = `${API}/calendar/events/${f.event.id}/court-day`;
    const initialResponse = await request.get(endpoint, { headers: f.headers });
    expect(initialResponse.ok()).toBe(true);
    const initial = await initialResponse.json();
    await f.open(page, `/court-day/${f.event.id}`);
    await page
      .getByLabel('บันทึกเตรียมนัด', { exact: true })
      .fill('บันทึกที่ยังไม่ส่ง');
    const saved = await request.patch(endpoint, {
      headers: f.headers,
      data: {
        version: 0,
        state: { ...initial.workspace.state, notes: 'อีกคนแก้แล้ว' },
      },
    });
    expect(saved.ok()).toBe(true);
    await page
      .getByRole('button', { name: 'บันทึกความพร้อม', exact: true })
      .click();
    await expect(page.locator('main').getByRole('alert')).toContainText(
      'มีคนแก้ข้อมูล',
    );
    await expect(
      page.getByLabel('บันทึกเตรียมนัด', { exact: true }),
    ).toHaveValue('บันทึกที่ยังไม่ส่ง');
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'โหลดข้อมูลล่าสุด' }).click();
    await expect(
      page.getByLabel('บันทึกเตรียมนัด', { exact: true }),
    ).toHaveValue('อีกคนแก้แล้ว');
    await page
      .getByLabel('บันทึกเตรียมนัด', { exact: true })
      .fill('ข้อมูลคงอยู่เมื่อบันทึกไม่สำเร็จ');
    await page.route('**/court-day', (route) =>
      route.request().method() === 'PATCH'
        ? route.abort('failed')
        : route.continue(),
    );
    await page
      .getByRole('button', { name: 'บันทึกความพร้อม', exact: true })
      .click();
    await expect(page.locator('main').getByRole('alert')).toContainText(
      'ข้อมูลที่กรอกยังอยู่',
    );
    await expect(
      page.getByLabel('บันทึกเตรียมนัด', { exact: true }),
    ).toHaveValue('ข้อมูลคงอยู่เมื่อบันทึกไม่สำเร็จ');
    await page.unroute('**/court-day');
    await page
      .getByRole('button', { name: 'บันทึกความพร้อม', exact: true })
      .click();
    await expect(page.locator('footer [role="status"]')).toHaveText(
      'บันทึกแล้ว',
    );
    const current = (
      await (await request.get(endpoint, { headers: f.headers })).json()
    ).workspace;
    const wrongCase = await f.db.case.create({
      data: {
        firmId: f.auth.user.firmId,
        ownRef: `${f.tag}-2`,
        folderId: `${f.tag}-2`,
        title: 'อีกคดี',
        leadLawyerId: f.auth.user.id,
      },
    });
    const wrongTask = await f.db.task.create({
      data: {
        caseId: wrongCase.id,
        title: 'งานอีกคดี',
        createdById: f.auth.user.id,
      },
    });
    expect(
      (
        await request.patch(endpoint, {
          headers: f.headers,
          data: {
            version: current.version,
            state: { ...current.state, taskIds: [wrongTask.id] },
          },
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await request.patch(endpoint, {
          headers: f.headers,
          data: { version: current.version },
        })
      ).status(),
    ).toBe(400);
    const admin = await request.post(`${API}/auth/login`, {
      data: { email: 'admin@lawfirm.com', password: 'password123' },
    });
    const outsider = {
      Authorization: `Bearer ${(await admin.json()).accessToken}`,
    };
    expect((await request.get(endpoint, { headers: outsider })).status()).toBe(
      404,
    );
    expect(
      (
        await request.patch(endpoint, {
          headers: outsider,
          data: { version: 0, state: initial.workspace.state },
        })
      ).status(),
    ).toBe(404);
    expect(
      (
        await request.post(`${endpoint}/complete`, {
          headers: outsider,
          data: { version: 0, eventUpdatedAt: f.event.updatedAt.toISOString() },
        })
      ).status(),
    ).toBe(404);
    const owner = await f.db.user.findUniqueOrThrow({
      where: { id: f.auth.user.id },
    });
    const member = await f.db.user.create({
      data: {
        email: `${f.tag}-member@example.test`,
        passwordHash: owner.passwordHash,
        firstName: 'Team',
        lastName: 'Lawyer',
        role: 'LAWYER',
        firmMembers: { create: { firmId: f.auth.user.firmId, role: 'LAWYER' } },
      },
    });
    const memberLogin = await request.post(`${API}/auth/login`, {
      data: { email: member.email, password: f.password },
    });
    const memberHeaders = {
      Authorization: `Bearer ${(await memberLogin.json()).accessToken}`,
    };
    expect(
      (await request.get(endpoint, { headers: memberHeaders })).status(),
    ).toBe(404);
    await f.db.caseAssignment.create({
      data: {
        caseId: f.legalCase.id,
        userId: member.id,
        assignmentType: 'BUDDY',
      },
    });
    const shared = await request.get(endpoint, { headers: memberHeaders });
    expect(shared.status()).toBe(200);
    expect((await shared.json()).workspace.state.notes).toBe(
      'ข้อมูลคงอยู่เมื่อบันทึกไม่สำเร็จ',
    );
    // Future outcomes fail without generating any side effects.
    const future = `${API}/calendar/events/${f.tomorrow.id}/court-day`;
    await request.patch(future, {
      headers: f.headers,
      data: {
        version: 0,
        state: { ...initial.workspace.state, outcome: 'ห้ามบันทึกอนาคต' },
      },
    });
    expect(
      (
        await request.post(`${future}/complete`, {
          headers: f.headers,
          data: {
            version: 1,
            eventUpdatedAt: f.tomorrow.updatedAt.toISOString(),
          },
        })
      ).status(),
    ).toBe(400);
    // Calendar changes are checked before any outcome is written.
    const withOutcome = await request.patch(endpoint, {
      headers: f.headers,
      data: {
        version: current.version,
        state: {
          ...current.state,
          outcome: 'ผลที่ยืนยันแล้ว',
          followUp: true,
          taskTitle: 'งานต่อ',
        },
      },
    });
    const version = (await withOutcome.json()).version;
    const changed = await f.db.calendarEvent.update({
      where: { id: f.event.id },
      data: { title: 'แก้ชื่อนัด' },
    });
    expect(
      (
        await request.post(`${endpoint}/complete`, {
          headers: f.headers,
          data: { version, eventUpdatedAt: f.event.updatedAt.toISOString() },
        })
      ).status(),
    ).toBe(409);
    const completions = await Promise.all(
      [1, 2].map(() =>
        request.post(`${endpoint}/complete`, {
          headers: f.headers,
          data: { version, eventUpdatedAt: changed.updatedAt.toISOString() },
        }),
      ),
    );
    expect(completions.map((r) => r.status())).toEqual([201, 201]);
    expect(
      await f.db.caseActivity.count({ where: { caseId: f.legalCase.id } }),
    ).toBe(1);
    expect(
      await f.db.closingEmailDraft.count({ where: { caseId: f.legalCase.id } }),
    ).toBe(1);
  } finally {
    await f.cleanup();
  }
});

for (const width of [320, 375, 414, 768, 1440]) {
  test(`court day responsive ${width}px TH/EN`, async ({
    page,
    request,
  }, testInfo) => {
    test.setTimeout(120_000);
    const f = await fixture(request);
    try {
      await page.setViewportSize({ width, height: 900 });
      for (const locale of ['th', 'en']) {
        await f.open(page, `/court-day/${f.event.id}`, locale);
        await expect(page.getByTestId('court-day')).toBeVisible();
        for (const stage of [0, 1, 2]) {
          await page
            .locator('nav[aria-label]')
            .filter({ has: page.locator('[aria-current="step"]') })
            .getByRole('button')
            .nth(stage)
            .click();
          if (stage === 1) {
            const th = locale === 'th';
            await page
              .getByLabel(th ? 'มีนัดครั้งหน้า' : 'Add the next appointment', {
                exact: true,
              })
              .check();
            await page
              .getByLabel(th ? 'ชื่อนัดครั้งหน้า' : 'Next appointment title', {
                exact: true,
              })
              .fill(th ? 'นัดตรวจเอกสาร' : 'Document review hearing');
            await page
              .getByLabel(
                th ? 'ผลนัดที่เกิดขึ้นจริง' : 'What happened at the hearing',
                { exact: true },
              )
              .fill(
                th
                  ? 'บันทึกผลนัดเพื่อทดสอบหน้าจอ'
                  : 'A hearing outcome for responsive testing.',
              );
            await page
              .getByLabel(
                th
                  ? 'วันและเวลานัดครั้งหน้า'
                  : 'Next appointment date and time',
                { exact: true },
              )
              .fill('2027-01-20T09:00');
          }
          await expect(page.locator('[aria-current="step"]')).toContainText(
            `0${stage + 1}`,
          );
          await expect
            .poll(() =>
              page
                .locator('main')
                .evaluate((el) => el.scrollWidth - el.clientWidth),
            )
            .toBeLessThanOrEqual(1);
          await expect
            .poll(() =>
              page.evaluate(
                () => document.documentElement.scrollWidth - innerWidth,
              ),
            )
            .toBeLessThanOrEqual(1);
          await page.screenshot({
            path: testInfo.outputPath(
              `court-${locale}-${width}-step-${stage}.png`,
            ),
            fullPage: true,
          });
        }
        await page.evaluate(() => {
          for (const key of Object.keys(sessionStorage))
            if (key.startsWith('samnuan:court-draft:'))
              sessionStorage.removeItem(key);
        });
      }
    } finally {
      await f.cleanup();
    }
  });
}

test('court day batch rolls back every record when a downstream write fails', async ({
  request,
}) => {
  const f = await fixture(request);
  try {
    const endpoint = `${API}/calendar/events/${f.event.id}/court-day`;
    const initial = await (
      await request.get(endpoint, { headers: f.headers })
    ).json();
    const state = {
      ...initial.workspace.state,
      outcome: 'ผลนัดเพื่อทดสอบ rollback',
      nextHearing: true,
      nextTitle: 'นัดใหม่',
      nextAt: new Date(Date.now() + 86400000).toISOString(),
    };
    expect(
      (
        await request.patch(endpoint, {
          headers: f.headers,
          data: { version: 0, state },
        })
      ).ok(),
    ).toBe(true);
    // Exercise the actual service and PostgreSQL transaction. Only the
    // downstream dependency fails; no global DB triggers or fixture resets.
    const {
      CourtDayService,
    } = require('../../apps/api/dist/calendar/court-day.service');
    const {
      CaseAccessService,
    } = require('../../apps/api/dist/common/services/case-access.service');
    const service = new CourtDayService(f.db, new CaseAccessService(f.db), {
      applyTrigger: async () => {
        throw new Error('Simulated downstream failure');
      },
    });
    await expect(
      service.complete(f.auth.user, f.event.id, {
        version: 1,
        eventUpdatedAt: f.event.updatedAt.toISOString(),
      }),
    ).rejects.toThrow('Simulated downstream failure');
    const workspace = await f.db.courtDay.findUniqueOrThrow({
      where: { eventId: f.event.id },
    });
    expect(workspace.version).toBe(1);
    expect(workspace.completedAt).toBeNull();
    expect(workspace.result).toBeNull();
    expect(
      await f.db.caseActivity.count({ where: { caseId: f.legalCase.id } }),
    ).toBe(0);
    expect(
      await f.db.calendarEvent.count({ where: { caseId: f.legalCase.id } }),
    ).toBe(2);
    expect(
      await f.db.closingEmailDraft.count({ where: { caseId: f.legalCase.id } }),
    ).toBe(0);
  } finally {
    await f.cleanup();
  }
});

test('court day restores unsaved navigation drafts and clears them on logout', async ({
  page,
  request,
}) => {
  const f = await fixture(request);
  try {
    await f.open(page, `/court-day/${f.event.id}`);
    await page
      .getByLabel('บันทึกเตรียมนัด', { exact: true })
      .fill('ร่างที่ยังไม่ส่งให้ทีม');
    await expect
      .poll(() =>
        page.evaluate(() =>
          Object.keys(sessionStorage).some((key) =>
            key.startsWith('samnuan:court-draft:'),
          ),
        ),
      )
      .toBe(true);
    await page.getByRole('link', { name: 'My Day', exact: true }).click();
    // The event also appears in the Action Center's acknowledgement queue with
    // the same title, so scope to the court-day panel's own link by href.
    await page
      .locator('main')
      .locator(`a[href^="/court-day/"]`)
      .filter({ hasText: `นัดศาล ${f.tag}` })
      .click();
    await expect(
      page.getByLabel('บันทึกเตรียมนัด', { exact: true }),
    ).toHaveValue('ร่างที่ยังไม่ส่งให้ทีม');
    await expect(page.locator('main')).toContainText(
      'กู้คืนข้อมูลที่ยังไม่บันทึก',
    );
    expect(await f.db.courtDay.count({ where: { eventId: f.event.id } })).toBe(
      0,
    );
    await page.getByRole('button', { name: 'ออกจากระบบ', exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    expect(
      await page.evaluate(() =>
        Object.keys(sessionStorage).filter((key) =>
          key.startsWith('samnuan:court-draft:'),
        ),
      ),
    ).toEqual([]);
  } finally {
    await f.cleanup();
  }
});
