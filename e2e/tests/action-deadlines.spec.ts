import { test, expect, APIRequestContext, Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { localTestData } from '../helpers/test-data';
const API = process.env.E2E_API_URL ?? 'http://localhost:3001';

async function fixture(request: APIRequestContext) {
  const data = localTestData();
  const ruleIds: string[] = [];
  try {
    const registration = await request.post(`${API}/auth/register`, { data: { firmName: data.firmName, firstName: 'Action', lastName: 'Lawyer', email: data.email, password: data.password } });
    expect(registration.status()).toBe(201);
    const auth = await registration.json();
    const headers = { Authorization: `Bearer ${auth.accessToken}` };
    const legalCase = await data.db.case.create({ data: { firmId: auth.user.firmId, ownRef: data.tag, folderId: data.tag, title: `Action ${data.tag}`, leadLawyerId: auth.user.id } });
    const startAt = new Date(Date.now() + 3600000);
    const event = await data.db.calendarEvent.create({ data: { caseId: legalCase.id, title: `Appointment ${data.tag}`, type: 'COURT_DATE', startAt, endAt: new Date(+startAt + 3600000), assigneeId: auth.user.id, reminderMinutes: [] } });
    // This local database retains the preexisting tenant column; do not migrate unrelated master data.
    const columns = await data.db.$queryRaw<Array<{ column_name: string }>>`SELECT column_name FROM information_schema.columns WHERE table_name = 'DeadlineRule'`;
    const rules = [];
    for (const offsetDays of [3, 5]) {
      const id = randomUUID();
      if (columns.some(c => c.column_name === 'firmId')) {
        await data.db.$executeRaw`INSERT INTO "DeadlineRule" ("id", "firmId", "label", "trigger", "offsetDays", "dayBasis", "isActive", "updatedAt") VALUES (${id}, ${auth.user.firmId}, ${`${data.tag}-${offsetDays}`}, 'COURT_DATE', ${offsetDays}, 'CALENDAR', false, NOW())`;
      } else {
        await data.db.deadlineRule.create({ data: { id, label: `${data.tag}-${offsetDays}`, trigger: 'COURT_DATE', offsetDays, dayBasis: 'CALENDAR', isActive: false } });
      }
      ruleIds.push(id);
      rules.push({ id });
    }
    const linkedStart = new Date(+startAt + 3 * 86400000);
    const linked = await data.db.calendarEvent.create({ data: { caseId: legalCase.id, title: `Linked ${data.tag}`, type: 'DEADLINE', startAt: linkedStart, endAt: new Date(+linkedStart + 7200000), reminderMinutes: [] } });
    const confirmed = await data.db.documentDateSuggestion.create({ data: { caseId: legalCase.id, label: 'Confirmed deadline', suggestedDate: linkedStart, source: 'RULE', deadlineRuleId: rules[0].id, triggerEventId: event.id, status: 'CONFIRMED', calendarEventId: linked.id, createdById: auth.user.id } });
    const pending = await data.db.documentDateSuggestion.create({ data: { caseId: legalCase.id, label: `Pending ${data.tag}`, suggestedDate: new Date(+startAt + 5 * 86400000), source: 'RULE', deadlineRuleId: rules[1].id, triggerEventId: event.id, createdById: auth.user.id } });
    const unassigned = await data.db.task.create({ data: { caseId: legalCase.id, title: `Unassigned ${data.tag}`, createdById: auth.user.id } });
    const waiting = await data.db.task.create({ data: { caseId: legalCase.id, title: `Waiting ${data.tag}`, createdById: auth.user.id, assigneeId: auth.user.id, onHold: { create: { reason: 'Waiting for client', nextFollowUpAt: startAt, createdById: auth.user.id } } } });
    const origin = `http://${auth.user.firmSlug}.localhost:3005`;
    return { ...data, auth, headers, legalCase, event, linked, confirmed, pending, unassigned, waiting,
      async open(page: Page, locale: string) { const hash = new URLSearchParams({ access_token: auth.accessToken, refresh_token: auth.refreshToken, next: '/my-day', locale }); await page.goto(`${origin}/handoff#${hash}`); await expect(page).toHaveURL(`${origin}/my-day`); },
      async cleanup() { await data.db.deadlineRule.deleteMany({ where: { id: { in: ruleIds } } }); await data.cleanup(); },
    };
  } catch (err) { await data.db.deadlineRule.deleteMany({ where: { id: { in: ruleIds } } }); await data.cleanup(); throw err; }
}

async function jsonOk(response: Awaited<ReturnType<APIRequestContext['get']>>) { expect(response.ok(), await response.text()).toBe(true); return response.json(); }

test('action queue scopes existing work and acknowledgement is owner-only, revision-safe and idempotent', async ({ request }) => {
  const f = await fixture(request);
  const other = await fixture(request);
  try {
    const closed = await f.db.case.create({ data: { firmId: f.auth.user.firmId, ownRef: `${f.tag}-closed`, folderId: `${f.tag}-closed`, title: 'Closed', leadLawyerId: f.auth.user.id, status: 'CLOSED' } });
    const closedTask = await f.db.task.create({ data: { caseId: closed.id, title: 'Closed task', createdById: f.auth.user.id } });
    const queue = await jsonOk(await request.get(`${API}/agenda/actions`, { headers: f.headers }));
    expect(queue.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: `task:${f.unassigned.id}`, kind: 'UNASSIGNED' }),
      expect.objectContaining({ id: `task:${f.waiting.id}`, kind: 'WAITING', detail: 'Waiting for client' }),
      expect.objectContaining({ id: `date:${f.pending.id}`, kind: 'DATE_REVIEW' }),
      expect.objectContaining({ id: `ack:${f.event.id}`, kind: 'ACKNOWLEDGEMENT' }),
    ]));
    expect(queue.items.some((i: { id: string }) => [closedTask.id, other.event.id, other.unassigned.id, other.pending.id].some(id => i.id.endsWith(id)))).toBe(false);
    const endpoint = `${API}/calendar/events/${f.event.id}`;
    expect((await request.get(`${endpoint}/responsibility`, { headers: other.headers })).status()).toBe(404);
    const owner = await f.db.user.findUniqueOrThrow({ where: { id: f.auth.user.id } });
    const member = await f.db.user.create({ data: { email: `${f.tag}-member@example.test`, passwordHash: owner.passwordHash, firstName: 'Other', lastName: 'Lawyer', role: 'LAWYER', firmMembers: { create: { firmId: f.auth.user.firmId, role: 'LAWYER' } } } });
    await f.db.caseAssignment.create({ data: { caseId: f.legalCase.id, userId: member.id, assignmentType: 'BUDDY' } });
    const login = await jsonOk(await request.post(`${API}/auth/login`, { data: { email: member.email, password: f.password } }));
    const memberHeaders = { Authorization: `Bearer ${login.accessToken}` };
    expect((await request.post(`${endpoint}/acknowledge`, { headers: memberHeaders, data: { eventUpdatedAt: f.event.updatedAt.toISOString() } })).status()).toBe(403);
    expect((await request.post(`${endpoint}/acknowledge`, { headers: f.headers, data: { eventUpdatedAt: new Date(0).toISOString() } })).status()).toBe(409);
    const responses = await Promise.all([1, 2].map(() => request.post(`${endpoint}/acknowledge`, { headers: f.headers, data: { eventUpdatedAt: f.event.updatedAt.toISOString() } })));
    for (const response of responses) await jsonOk(response);
    expect(await f.db.auditLog.count({ where: { firmId: f.auth.user.firmId, action: 'EVENT_ACKNOWLEDGED' } })).toBe(1);
    const after = await jsonOk(await request.get(`${API}/agenda/actions`, { headers: f.headers }));
    expect(after.items.some((i: { id: string }) => i.id === `ack:${f.event.id}`)).toBe(false);
  } finally { await other.cleanup(); await f.cleanup(); }
});

test('reschedule commits confirmed and pending impacts, preserves durations, resets reminders and rejects stale previews', async ({ request }) => {
  const f = await fixture(request);
  try {
    const endpoint = `${API}/calendar/events/${f.event.id}`;
    await f.db.reminderLog.createMany({ data: [f.event.id, f.linked.id].map(eventId => ({ eventId, minutesBefore: 60, channel: 'e2e-local' })) });
    const startAt = new Date(+f.event.startAt + 7 * 86400000).toISOString();
    const preview = await jsonOk(await request.post(`${endpoint}/reschedule-preview`, { headers: f.headers, data: { startAt } }));
    expect(preview.impacts).toHaveLength(2);
    await jsonOk(await request.post(`${endpoint}/reschedule`, { headers: f.headers, data: { startAt, fingerprint: preview.fingerprint, reason: 'Test revised hearing date' } }));
    const saved = await f.db.calendarEvent.findUniqueOrThrow({ where: { id: f.event.id } });
    const linked = await f.db.calendarEvent.findUniqueOrThrow({ where: { id: f.linked.id } });
    expect(saved.startAt.toISOString()).toBe(startAt);
    expect(+saved.endAt! - +saved.startAt).toBe(3600000);
    expect(+linked.endAt! - +linked.startAt).toBe(7200000);
    for (const impact of preview.impacts) {
      const suggestion = await f.db.documentDateSuggestion.findUniqueOrThrow({ where: { id: impact.id } });
      expect(suggestion.suggestedDate.toISOString()).toBe(impact.newAt);
      expect(suggestion.status).toBe(impact.status);
      if (impact.eventId) expect(linked.startAt.toISOString()).toBe(impact.newAt);
      else expect(suggestion.calendarEventId).toBeNull();
    }
    expect(await f.db.reminderLog.count({ where: { eventId: { in: [f.event.id, f.linked.id] } } })).toBe(0);
    const audit = await f.db.auditLog.findFirstOrThrow({ where: { firmId: f.auth.user.firmId, action: 'EVENT_RESCHEDULED' } });
    expect(audit.metadata).toEqual(expect.objectContaining({ reason: 'Test revised hearing date', previousReminders: expect.arrayContaining([expect.objectContaining({ channel: 'e2e-local' })]) }));
    expect((await request.post(`${endpoint}/reschedule`, { headers: f.headers, data: { startAt, fingerprint: preview.fingerprint, reason: 'Replay stale preview' } })).status()).toBe(409);
    const next = new Date(+saved.startAt + 86400000).toISOString();
    const second = await jsonOk(await request.post(`${endpoint}/reschedule-preview`, { headers: f.headers, data: { startAt: next } }));
    await f.db.documentDateSuggestion.update({ where: { id: f.pending.id }, data: { label: 'Changed during review' } });
    expect((await request.post(`${endpoint}/reschedule`, { headers: f.headers, data: { startAt: next, fingerprint: second.fingerprint, reason: 'Stale linked item' } })).status()).toBe(409);
    expect((await f.db.calendarEvent.findUniqueOrThrow({ where: { id: f.event.id } })).startAt.toISOString()).toBe(startAt);
  } finally { await f.cleanup(); }
});

test('concurrent date confirmation creates one calendar event', async ({ request }) => {
  const f = await fixture(request);
  try {
    const before = await f.db.calendarEvent.count({ where: { caseId: f.legalCase.id } });
    const responses = await Promise.all([1, 2].map(() => request.post(`${API}/cases/${f.legalCase.id}/date-suggestions/${f.pending.id}/confirm`, { headers: f.headers, data: { reminderMinutes: [], expectedUpdatedAt: f.pending.updatedAt.toISOString() } })));
    expect(responses.some(r => r.ok())).toBe(true);
    expect(responses.every(r => r.ok() || [400, 409].includes(r.status()))).toBe(true);
    expect(await f.db.calendarEvent.count({ where: { caseId: f.legalCase.id } })).toBe(before + 1);
    const suggestion = await f.db.documentDateSuggestion.findUniqueOrThrow({ where: { id: f.pending.id } });
    expect(suggestion.status).toBe('CONFIRMED');
    expect(suggestion.calendarEventId).toBeTruthy();
  } finally { await f.cleanup(); }
});

for (const locale of ['th', 'en']) test(`mobile ${locale}: My Day action → acknowledge → reschedule`, async ({ page, request }, testInfo) => {
  const f = await fixture(request);
  const th = locale === 'th';
  try {
    await page.setViewportSize({ width: 375, height: 850 });
    await f.open(page, locale);
    await page.locator(`a[href="/cases/${f.legalCase.id}?tab=calendar&eventId=${f.event.id}"]`).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: th ? 'ฉันรับผิดชอบนัดนี้' : 'Acknowledge responsibility', exact: true }).click();
    await expect(dialog).toContainText(th ? 'รับงานแล้ว' : 'Acknowledged');
    await dialog.getByRole('button', { name: th ? 'เลื่อนนัดและตรวจกำหนดที่เกี่ยวข้อง' : 'Reschedule and review related dates', exact: true }).click();
    await dialog.getByLabel(th ? 'วันและเวลาใหม่ (กรุงเทพฯ)' : 'New date and time (Bangkok)', { exact: true }).fill('2027-03-20T09:00');
    await dialog.getByLabel(th ? 'เหตุผลที่เลื่อน' : 'Reason for rescheduling', { exact: true }).fill('Confirmed revised date');
    await dialog.getByRole('button', { name: th ? 'ตรวจผลกระทบก่อน' : 'Preview changes', exact: true }).click();
    await expect(dialog).toContainText(th ? 'กำหนดที่ได้รับผลกระทบ 2 รายการ' : '2 affected dates');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath(`action-deadlines-${locale}-mobile.png`), fullPage: true });
    await dialog.getByRole('button', { name: th ? 'ยืนยันวันใหม่และกำหนดที่แสดง' : 'Confirm these revised dates', exact: true }).click();
    await expect.poll(async () => (await f.db.calendarEvent.findUniqueOrThrow({ where: { id: f.event.id } })).startAt.toISOString()).toBe('2027-03-20T02:00:00.000Z');
  } finally { await f.cleanup(); }
});
