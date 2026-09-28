// Verify persisted results after the native UI walkthrough, only on the isolated local server.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fixture = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const base = 'http://127.0.0.1:3101';
async function request(path, token, method = 'GET', body) {
  const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json();
  return { status: response.status, data };
}
async function main() {
  const tokens = {};
  for (const [role, user] of Object.entries(fixture.users)) {
    const login = await request('/auth/login', null, 'POST', { email: user.email, password: fixture.password });
    assert.equal(login.status, 201, JSON.stringify(login.data));
    assert.equal(login.data.user.firmId, fixture.firmId);
    tokens[role] = login.data.accessToken;
  }
  const event = (await request(`/calendar/events/${fixture.eventId}`, tokens.owner)).data;
  assert.equal(event.assigneeId, fixture.users.lawyer.id);
  assert.ok(event.assignees.some(person => person.userId === fixture.users.senior.id), 'UI-added companion was not persisted');
  const court = (await request(`/calendar/events/${fixture.eventId}/court-day`, tokens.lawyer)).data;
  assert.ok(court.workspace.completedAt, 'UI confirmation did not persist');
  assert.equal(court.workspace.state.notes, 'ศาลให้ส่งเอกสารใน 7 วัน');
  assert.ok(court.workspace.state.outcome.includes('7 วัน'));
  const range = new URLSearchParams({ from: fixture.day + 'T00:00:00+07:00', to: fixture.day + 'T23:59:59.999+07:00' });
  const events = (await request('/calendar/events?' + range, tokens.owner)).data;
  assert.equal(events.length, 2, 'Completed appointments must stay in the calendar');
  assert.equal(events.filter(item => item.assigneeId === fixture.users.lawyer.id || item.assignees.some(person => person.userId === fixture.users.lawyer.id)).length, 2);
  const workload = (await request('/dashboard/workload', tokens.owner)).data;
  assert.ok(workload.members.some(person => person.id === fixture.users.assistant.id));
  const leaves = (await request(`/leaves?from=${fixture.day}&to=${fixture.day}`, tokens.owner)).data;
  assert.ok(leaves.some(item => item.userId === fixture.users.lawyer.id && item.type === 'PERSONAL' && item.status === 'PENDING'), 'UI leave request did not persist');
  const claims = (await request('/expense-claims', tokens.owner)).data;
  const uiClaim = claims.find(item => item.totalAmount === 200 && item.itemCount === 2 && item.submittedBy.id === fixture.users.lawyer.id);
  assert.ok(uiClaim, 'UI batch was not created');
  assert.equal(uiClaim.status, 'PAID', 'Owner UI approve/payment did not persist');
  const detail = (await request(`/expense-claims/${uiClaim.id}`, tokens.owner)).data;
  assert.deepEqual(detail.expenses.map(item => Number(item.amount)).sort((a, b) => a - b), [80, 120]);
  const fund = await request('/petty-cash', tokens.owner);
  assert.equal(fund.status, 200);
  assert.equal(Number(fund.data.balance), 49800, 'Approve/pay must deduct the batch only once');
  assert.ok((await request(`/expense-claims/${uiClaim.id}/status`, tokens.owner, 'PATCH', { status: 'APPROVED' })).status >= 400, 'Paid claims cannot be approved again');
  assert.equal(Number((await request('/petty-cash', tokens.owner)).data.balance), 49800);
  const forbidden = await request(`/expense-claims/${fixture.claimId}/status`, tokens.lawyer, 'PATCH', { status: 'APPROVED' });
  assert.equal(forbidden.status, 403, 'Non-owner cannot approve');
  const assistantClaims = await request('/expense-claims', tokens.assistant);
  assert.equal(assistantClaims.status, 200);
  assert.ok(!assistantClaims.data.some(item => item.id === uiClaim.id), 'Other users cannot see lawyer claims');
  assert.equal((await request(`/calendar/events/${fixture.eventId}/court-day`, tokens.senior)).status, 200);
  if (process.argv.includes('--ux')) {
    const expenses = (await request('/expenses', tokens.owner)).data;
    const uploads = expenses.filter(item => item.description === 'ทดสอบจอเล็กและเน็ตหลุด');
    assert.equal(uploads.length, 1, 'UI retry must leave only one saved test expense');
    assert.equal(Number(uploads[0].amount), 42);
    assert.equal(uploads[0].status, 'DRAFT');
    const receipt = await fetch(`${base}/expenses/${uploads[0].id}/receipt`, { headers: { Authorization: `Bearer ${tokens.owner}` } });
    assert.equal(receipt.status, 200);
    assert.match(receipt.headers.get('content-type'), /^image\//);
    assert.ok((await receipt.arrayBuffer()).byteLength > 100);
    console.log('PASS: native UI photo upload persisted once and authenticated image download returned bytes');
  }
  console.log(JSON.stringify({ result: 'PASS', checks: ['4 role logins', 'UI team persisted', 'UI court result persisted', 'Bangkok calendar full day', 'assistant manpower', 'UI leave pending', 'UI batch 200 / 2 items / paid', 'non-owner approval denied', 'claim account isolation', 'senior case access'], claimId: uiClaim.id }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
