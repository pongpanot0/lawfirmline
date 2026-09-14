import { test, expect, APIRequestContext, APIResponse } from '@playwright/test';
import { localTestData } from '../helpers/test-data';
const API = process.env.E2E_API_URL ?? 'http://localhost:3001';
async function ok(r: APIResponse) { expect(r.ok(), await r.text()).toBe(true); return r.json(); }
async function fixture(request: APIRequestContext) {
  const d = localTestData();
  try {
    const auth = await ok(await request.post(`${API}/auth/register`, { data: { firmName: d.firmName, firstName: 'Setup', lastName: 'Owner', email: d.email, password: d.password } }));
    const headers = { Authorization: `Bearer ${auth.accessToken}` };
    const existing = await d.db.client.create({ data: { firmId: auth.user.firmId, name: `Existing ${d.tag}` } });
    const legalCase = await d.db.case.create({ data: { firmId: auth.user.firmId, ownRef: d.tag, folderId: d.tag, title: `Existing ${d.tag}`, clientId: existing.id, leadLawyerId: auth.user.id } });
    const owner = await d.db.user.findUniqueOrThrow({ where: { id: auth.user.id } });
    const member = await d.db.user.create({ data: { email: `${d.tag}-member@example.test`, passwordHash: owner.passwordHash, firstName: 'Restricted', lastName: 'Lawyer', role: 'LAWYER', firmMembers: { create: { firmId: auth.user.firmId, role: 'LAWYER' } } } });
    const session = await ok(await request.post(`${API}/auth/login`, { data: { email: member.email, password: d.password } }));
    return { ...d, auth, headers, existing, legalCase, memberHeaders: { Authorization: `Bearer ${session.accessToken}` } };
  } catch (e) { await d.cleanup(); throw e; }
}
const base = `${API}/practice-setup`;

test('import previews, owner/tenant scope, concurrent replay, safe undo and rollback', async ({ request }) => {
  const f = await fixture(request); const other = await fixture(request);
  try {
    const preview = (rows: object[]) => request.post(`${base}/imports/preview`, { headers: f.headers, data: { rows } });
    const invalid = await ok(await preview([{ clientName: '', caseRef: 'BAD', caseTitle: '' }, { clientName: 'X', caseRef: f.tag, caseTitle: 'Duplicate' }]));
    expect(invalid.canCommit).toBe(false); expect(invalid.rows.every((r: { errors: string[] }) => r.errors.length)).toBe(true);
    expect((await request.post(`${base}/imports/${invalid.id}/commit`, { headers: f.headers })).status()).toBe(409);
    expect((await request.get(`${base}/progress`, { headers: f.memberHeaders })).status()).toBe(403);
    const rows = [{ clientName: f.existing.name, caseRef: `${f.tag}-one`, caseTitle: 'Imported one' }, { clientName: `New ${f.tag}`, caseRef: `${f.tag}-two`, caseTitle: 'Imported two' }];
    const batch = await ok(await preview(rows)); expect(batch.canCommit).toBe(true); expect(batch.rows[0].existingClientId).toBe(f.existing.id);
    expect((await request.post(`${base}/imports/${batch.id}/commit`, { headers: other.headers })).status()).toBe(404);
    expect((await request.post(`${base}/imports/${batch.id}/commit`, { headers: f.memberHeaders })).status()).toBe(403);
    const commits = await Promise.all([1, 2].map(() => request.post(`${base}/imports/${batch.id}/commit`, { headers: f.headers })));
    const committed = await Promise.all(commits.map(ok)); expect(committed[0].ledger).toEqual(committed[1].ledger);
    expect((await ok(await request.post(`${base}/imports/${batch.id}/commit`, { headers: f.headers }))).ledger).toEqual(committed[0].ledger);
    expect(await f.db.case.count({ where: { firmId: f.auth.user.firmId } })).toBe(3);
    await ok(await request.post(`${base}/imports/${batch.id}/undo`, { headers: f.headers }));
    await ok(await request.post(`${base}/imports/${batch.id}/undo`, { headers: f.headers }));
    expect(await f.db.case.count({ where: { firmId: f.auth.user.firmId } })).toBe(1);
    expect(await f.db.client.findUnique({ where: { id: f.existing.id } })).not.toBeNull();
    expect(await f.db.client.count({ where: { firmId: f.auth.user.firmId } })).toBe(1);
    for (const dependent of [false, true]) {
      const b = await ok(await preview(rows)); const c = await ok(await request.post(`${base}/imports/${b.id}/commit`, { headers: f.headers }));
      if (dependent) await f.db.task.create({ data: { title: 'Dependent task', caseId: c.ledger.cases[1].id, createdById: f.auth.user.id } });
      else await f.db.client.update({ where: { id: c.ledger.clients[0].id }, data: { name: 'Edited imported client' } });
      expect((await request.post(`${base}/imports/${b.id}/undo`, { headers: f.headers })).status()).toBe(409);
      expect(await f.db.case.count({ where: { id: { in: c.ledger.cases.map((r: { id: string }) => r.id) } } })).toBe(2);
      expect((await f.db.dataImportBatch.findUniqueOrThrow({ where: { id: b.id } })).status).toBe('COMMITTED');
      // Release names/refs for the next independent guard scenario.
      rows.forEach(r => { r.caseRef += '-next'; });
    }
  } finally { await other.cleanup(); await f.cleanup(); }
});

test('immutable playbook versions, concurrent apply and knowledge access', async ({ request }) => {
  const f = await fixture(request); const other = await fixture(request);
  try {
    const definition = { name: `Medical ${f.tag}`, workType: 'MEDICAL', steps: [{ title: 'Collect records', instructions: 'Ask for records', kind: 'DOCUMENT', days: 0 }, { title: 'Lawyer review', instructions: 'Review records', kind: 'APPROVAL', days: 2, parentIndex: 0 }] };
    const release = await ok(await request.post(`${base}/playbooks`, { headers: f.headers, data: definition }));
    const revised = await ok(await request.post(`${base}/playbooks`, { headers: f.headers, data: { ...definition, steps: [{ ...definition.steps[0], title: 'Updated procedure' }] } }));
    expect(release.version).toBe(1); expect(revised.version).toBe(2);
    expect((await f.db.playbookRelease.findUniqueOrThrow({ where: { id: release.id } })).steps).toEqual(definition.steps);
    expect((await request.post(`${base}/playbooks`, { headers: f.memberHeaders, data: definition })).status()).toBe(403);
    const payload = { releaseId: release.id, startDate: '2026-10-01T02:00:00.000Z' };
    const endpoint = `${base}/cases/${f.legalCase.id}`;
    const preview = await ok(await request.post(`${endpoint}/preview`, { headers: f.headers, data: payload }));
    expect(preview.steps[1].dueAt).toBe('2026-10-03T02:00:00.000Z');
    expect((await request.post(`${base}/cases/${other.legalCase.id}/apply`, { headers: f.headers, data: payload })).status()).toBe(404);
    expect((await request.post(`${base}/cases/${other.legalCase.id}/apply`, { headers: other.headers, data: payload })).status()).toBe(404);
    const applied = await Promise.all((await Promise.all([1, 2].map(() => request.post(`${endpoint}/apply`, { headers: f.headers, data: payload })))).map(ok));
    expect(applied[0].id).toBe(applied[1].id);
    expect((await ok(await request.post(`${endpoint}/apply`, { headers: f.headers, data: payload }))).id).toBe(applied[0].id);
    const tasks = await f.db.task.findMany({ where: { caseId: f.legalCase.id } }); expect(tasks).toHaveLength(2);
    expect(tasks.find(t => t.title === 'Lawyer review')?.parentId).toBe(tasks.find(t => t.title === 'Collect records')?.id);
    expect(tasks.every(t => t.assigneeId === f.auth.user.id)).toBe(true);
    await f.db.case.update({ where: { id: f.legalCase.id }, data: { status: 'CLOSED' } });
    expect((await request.post(`${endpoint}/apply`, { headers: f.headers, data: { ...payload, releaseId: revised.id } })).status()).toBe(400);
    for (const owner of [f, other]) await owner.db.caseKnowledge.create({ data: { caseId: owner.legalCase.id, title: 'Scoped needle', summary: owner.tag, category: 'SUMMARY', createdById: owner.auth.user.id } });
    const knowledge = await ok(await request.get(`${API}/knowledge?search=needle&category=SUMMARY`, { headers: f.headers }));
    expect(knowledge).toHaveLength(1); expect(knowledge[0].case.id).toBe(f.legalCase.id);
    expect(await ok(await request.get(`${API}/knowledge?caseId=${other.legalCase.id}&search=needle`, { headers: f.headers }))).toEqual([]);
    expect(await ok(await request.get(`${API}/knowledge?search=needle`, { headers: f.memberHeaders }))).toEqual([]);
  } finally { await other.cleanup(); await f.cleanup(); }
});
