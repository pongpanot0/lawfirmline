// Local API integration check: node scripts/check-task-assignment.cjs /private/tmp/samnuan-mobile-e2e-fixture.json
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fixture = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const base = 'http://127.0.0.1:3101';
async function request(path, token, method = 'GET', body) {
  const response = await fetch(base + path, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, data: text ? JSON.parse(text) : null };
}
async function main() {
  const tokens = {};
  for (const [role, user] of Object.entries(fixture.users)) {
    const login = await request('/auth/login', null, 'POST', { email: user.email, password: fixture.password });
    assert.equal(login.status, 201);
    assert.equal(login.data.user.firmId, fixture.firmId);
    tokens[role] = login.data.accessToken;
  }
  const members = await request('/users/lawyers', tokens.owner);
  assert.equal(members.status, 200);
  assert.ok(members.data.some(person => person.id === fixture.users.assistant.id && person.firmRole === 'ASSISTANT'));
  const cleanup = [];
  try {
    const created = await request('/todos', tokens.owner, 'POST', {
      title: 'Mobile assignment API check', assigneeId: fixture.users.lawyer.id,
    });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    const path = `/todos/${created.data.id}`;
    cleanup.push(path);
    assert.equal(created.data.assigneeId, fixture.users.lawyer.id);
    assert.ok((await request('/todos', tokens.lawyer)).data.some(task => task.id === created.data.id));
    const updated = await request(path, tokens.owner, 'PATCH', { assigneeId: fixture.users.assistant.id });
    assert.equal(updated.status, 200, JSON.stringify(updated.data));
    assert.equal(updated.data.assigneeId, fixture.users.assistant.id);
    assert.ok((await request('/todos', tokens.assistant)).data.some(task => task.id === created.data.id));
    assert.ok(!(await request('/todos', tokens.lawyer)).data.some(task => task.id === created.data.id));
    assert.equal((await request(path, tokens.senior, 'PATCH', { assigneeId: fixture.users.lawyer.id })).status, 403);
    const forbidden = await request('/todos', tokens.assistant, 'POST', {
      title: 'Must be denied', assigneeId: fixture.users.owner.id,
    });
    if (forbidden.status === 201) cleanup.push(`/todos/${forbidden.data.id}`);
    assert.equal(forbidden.status, 403);
    const casePath = `/cases/${fixture.caseId}/tasks`;
    const caseTask = await request(casePath, tokens.owner, 'POST', {
      title: 'Mobile case assignment API check', assigneeId: fixture.users.lawyer.id,
    });
    assert.equal(caseTask.status, 201, JSON.stringify(caseTask.data));
    const taskPath = `${casePath}/${caseTask.data.id}`;
    cleanup.push(taskPath);
    const reassigned = await request(`${taskPath}/reassign`, tokens.owner, 'PATCH', { assigneeId: fixture.users.senior.id });
    assert.equal(reassigned.status, 200, JSON.stringify(reassigned.data));
    assert.ok((await request(casePath, tokens.owner)).data.some(task => task.id === caseTask.data.id && task.assigneeId === fixture.users.senior.id));
    console.log('PASS: create assigned todo, change assignee, receiving-user visibility, role/ownership rejection, and case reassignment persisted on isolated local API');
  } finally {
    for (const path of cleanup) {
      const removed = await request(path, tokens.owner, 'DELETE');
      assert.equal(removed.status, 200, `Cleanup failed: ${path}`);
    }
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
