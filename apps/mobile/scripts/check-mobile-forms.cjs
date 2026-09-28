// Isolated local API only: node scripts/check-mobile-forms.cjs /private/tmp/samnuan-mobile-e2e-fixture.json
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fixture = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const base = 'http://127.0.0.1:3101';
const tokens = {};
async function request(path, role = 'owner', method = 'GET', body) {
  const form = body instanceof FormData;
  const response = await fetch(base + path, { method,
    headers: { ...(form ? {} : { 'Content-Type': 'application/json' }),
      ...(tokens[role] ? { Authorization: `Bearer ${tokens[role]}` } : {}) },
    body: body === undefined ? undefined : form ? body : JSON.stringify(body) });
  const text = await response.text();
  assert.ok(response.ok, `${method} ${path}: ${response.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}
async function upload(path, name, bytes) {
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: 'text/plain' }), name);
  return request(path, 'owner', 'POST', form);
}
async function download(path, expected) {
  const response = await fetch(base + path, { headers: { Authorization: `Bearer ${tokens.owner}` } });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), expected);
}
async function rejected(path, role, method, body, expected) {
  const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens[role]}` }, body: body === undefined ? undefined : JSON.stringify(body) });
  assert.equal(response.status, expected, `${method} ${path}: expected ${expected}, got ${response.status}`);
}
async function main() {
  for (const [role, user] of Object.entries(fixture.users)) {
    assert.ok(user.email.endsWith('@example.test'), 'Use fake local accounts only');
    const login = await request('/auth/login', role, 'POST', { email: user.email, password: fixture.password });
    assert.equal(login.user.firmId, fixture.firmId);
    tokens[role] = login.accessToken;
  }
  const cleanup = [];
  try {
    const todo = await request('/todos', 'owner', 'POST', {
      title: 'Mobile standalone review', assigneeId: fixture.users.assistant.id,
    });
    const todoPath = `/todos/${todo.id}`;
    cleanup.push(todoPath);
    await request(`${todoPath}/handoff`, 'assistant', 'PATCH', { reviewerId: fixture.users.lawyer.id });
    assert.equal((await request(`/tasks/${todo.id}`)).status, 'PENDING_REVIEW');
    await request(`${todoPath}/reject`, 'lawyer', 'POST', { reason: 'Revise local fixture' });
    assert.equal((await request(`/tasks/${todo.id}`)).assigneeId, fixture.users.assistant.id);
    await request(`${todoPath}/handoff`, 'assistant', 'PATCH', { reviewerId: fixture.users.lawyer.id });
    await request(`${todoPath}/accept`, 'lawyer', 'POST', {});
    assert.equal((await request(`/tasks/${todo.id}`)).status, 'DONE');
    const todoMarker = `mobile-todo-file-${Date.now()}`;
    const todoFile = await upload(`/tasks/${todo.id}/attachments`, `${todoMarker}.txt`, 'Standalone fixture');
    const todoFound = await request(`/documents/files?q=${todoMarker}`);
    assert.ok(todoFound.items.some(item => item.id === todoFile.id && item.task.id === todo.id && item.case === null));
    assert.ok(!(await request(`/documents/files?q=${todoMarker}`, 'assistant')).items.some(item => item.id === todoFile.id));
    const court = (await request('/courts'))[0];
    assert.ok(court?.name, 'Court dropdown requires a real catalog');
    const legalCase = await request('/cases', 'owner', 'POST', {
      title: 'Mobile forms integration check', clientName: 'Local fixture only', courtLevel: 'TRIAL',
      courtName: court.name, leadLawyerId: fixture.users.lawyer.id, buddyIds: [fixture.users.assistant.id],
    });
    const casePath = `/cases/${legalCase.id}`;
    cleanup.push(casePath);
    assert.equal(legalCase.leadLawyerId, fixture.users.lawyer.id);
    assert.ok(legalCase.assignments.some(item => item.userId === fixture.users.assistant.id && item.assignmentType === 'BUDDY'));
    await request(casePath, 'owner', 'PATCH', { title: 'Mobile forms edited', status: 'IN_PROGRESS' });
    await request(`${casePath}/assignments`, 'owner', 'PUT', { buddyIds: [fixture.users.assistant.id, fixture.users.senior.id] });
    const detail = await request(casePath);
    assert.equal(detail.title, 'Mobile forms edited');
    assert.equal(detail.status, 'IN_PROGRESS');
    assert.equal(detail.assignments.filter(item => item.assignmentType === 'BUDDY').length, 2);
    const marker = `mobile-file-${Date.now()}`;
    const bytes = 'Local mobile attachment test, no real client data';
    const document = await upload(`${casePath}/documents`, `${marker}.txt`, bytes);
    await download(`${casePath}/documents/${document.id}/download`, bytes);
    const found = await request(`/documents/search?q=${encodeURIComponent(marker.toUpperCase().slice(0, -2))}`);
    assert.ok(found.some(item => item.id === document.id && item.filename === `${marker}.txt` && item.case.id === legalCase.id));
    const noMatch = await request(`/documents/search?q=does-not-exist-${marker}`);
    assert.equal(noMatch.length, 0);
    const task = await request(`${casePath}/tasks`, 'owner', 'POST', {
      title: 'Mobile task with file', assigneeId: fixture.users.assistant.id, description: 'Before court', status: 'TODO',
    });
    const taskPath = `${casePath}/tasks/${task.id}`;
    cleanup.push(taskPath);
    const attachment = await upload(`/tasks/${task.id}/attachments`, `${marker}-task.txt`, bytes);
    await download(`/tasks/${task.id}/attachments/${attachment.id}/download`, bytes);
    const mixed = await request(`/documents/files?q=${encodeURIComponent(marker.toUpperCase().slice(0, -2))}`);
    assert.ok(mixed.items.some(item => item.id === document.id && item.source === 'CASE'));
    assert.ok(mixed.items.some(item => item.id === attachment.id && item.source === 'TASK' && item.task.id === task.id));
    await request(`${casePath}/documents/${document.id}/metadata`, 'owner', 'PATCH', { tags: ['tag-only-fixture'] });
    assert.equal((await request('/documents/files?q=tag-only-fixture')).items.length, 0);
    const privateCase = await request('/cases', 'owner', 'POST', { title: 'Private file-search fixture', courtLevel: 'TRIAL', leadLawyerId: fixture.users.owner.id });
    cleanup.push(`/cases/${privateCase.id}`);
    const privateDoc = await upload(`/cases/${privateCase.id}/documents`, `${marker}-private.txt`, bytes);
    assert.ok((await request(`/documents/files?q=${marker}`)).items.some(item => item.id === privateDoc.id));
    assert.ok(!(await request(`/documents/files?q=${marker}`, 'assistant')).items.some(item => item.id === privateDoc.id));
    await rejected(`/cases/${privateCase.id}/documents/${privateDoc.id}/download`, 'assistant', 'GET', undefined, 403);
    const pageMarker = `page-fixture-${Date.now()}`;
    for (let batch = 0; batch < 21; batch++) await Promise.all(Array.from({ length: 5 }, (_, index) =>
      upload(`${casePath}/documents`, `${pageMarker}-${batch * 5 + index}.txt`, bytes)));
    const paged = [];
    let offset = 0;
    do {
      const page = await request(`/documents/files?q=${pageMarker}&offset=${offset}`);
      assert.ok(page.items.length <= 20);
      paged.push(...page.items);
      offset = page.nextOffset;
    } while (offset !== null);
    assert.equal(paged.length, 105);
    assert.equal(new Set(paged.map(item => `${item.source}:${item.id}`)).size, 105);
    await rejected('/documents/files?q=test&offset=-1', 'owner', 'GET', undefined, 400);
    await request(`/tasks/${task.id}/comments`, 'assistant', 'POST', { body: 'Ready for review' });
    const taskDetail = await request(`/tasks/${task.id}`);
    assert.ok(taskDetail.attachments.some(item => item.id === attachment.id));
    assert.ok(taskDetail.comments.some(item => item.body === 'Ready for review'));
    await request(`${taskPath}/handoff`, 'assistant', 'PATCH', {});
    assert.equal((await request(`/tasks/${task.id}`)).status, 'PENDING_REVIEW');
    await request(`${taskPath}/reject`, 'lawyer', 'POST', { reason: 'Add evidence' });
    assert.equal((await request(`/tasks/${task.id}`)).status, 'NEEDS_REVISION');
    await request(`${taskPath}/handoff`, 'assistant', 'PATCH', {});
    await request(`${taskPath}/accept`, 'lawyer', 'POST', {});
    assert.equal((await request(`/tasks/${task.id}`)).status, 'DONE');
    const event = await request('/calendar/events', 'owner', 'POST', {
      caseId: legalCase.id, title: 'Mobile multi-person appointment', type: 'COURT_DATE', courtName: court.name,
      startAt: '2026-09-28T09:00:00+07:00', assigneeIds: [fixture.users.lawyer.id, fixture.users.assistant.id, fixture.users.senior.id],
    });
    const eventPath = `/calendar/events/${event.id}`;
    cleanup.push(eventPath);
    assert.equal(event.assigneeId, fixture.users.lawyer.id);
    assert.equal(event.assignees.length, 3);
    const startAt = '2026-09-28T10:00:00+07:00';
    const impact = await request(`${eventPath}/reschedule-preview`, 'owner', 'POST', { startAt });
    assert.equal(impact.impacts.length, 0);
    await request(`${eventPath}/reschedule`, 'owner', 'POST', { startAt, fingerprint: impact.fingerprint, reason: 'Local test only' });
    await request(eventPath, 'owner', 'PATCH', { title: 'Mobile appointment edited',
      assigneeIds: [fixture.users.senior.id, fixture.users.lawyer.id] });
    const edited = await request(eventPath);
    assert.equal(edited.title, 'Mobile appointment edited');
    assert.equal(edited.assigneeId, fixture.users.senior.id);
    assert.equal(edited.assignees.length, 2);
    assert.equal(new Date(edited.startAt).toISOString(), '2026-09-28T03:00:00.000Z');
    const outstanding = await request(`${casePath}/outstanding`, 'lawyer');
    assert.ok(outstanding.total > 0);
    await rejected(`${casePath}/close`, 'lawyer', 'POST', { closingSummary: 'Local closing summary test' }, 400);
    await rejected(`${casePath}/close`, 'lawyer', 'POST', { closingSummary: 'short', acknowledgeOutstanding: true }, 400);
    const closed = await request(`${casePath}/close`, 'lawyer', 'POST', { closingSummary: 'Local closing summary test', outcome: 'SETTLED', acknowledgeOutstanding: true });
    assert.equal(closed.status, 'CLOSED'); assert.equal(closed.outcome, 'SETTLED');
    assert.equal((await request(`${casePath}/archive`, 'lawyer', 'POST', {})).status, 'ARCHIVED');
    const reopened = await request(`${casePath}/reopen`, 'lawyer', 'POST', {});
    assert.equal(reopened.status, 'IN_PROGRESS'); assert.equal(reopened.closedAt, null);
    assert.equal((await request(`${casePath}/outstanding`)).total, outstanding.total);
    console.log('PASS: cases/team/files, filename-only case + task + standalone search, permission isolation, pagination beyond 100, task review, appointments, close/outstanding/archive/reopen');
  } finally {
    for (const path of cleanup.reverse()) await request(path, 'owner', 'DELETE');
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
