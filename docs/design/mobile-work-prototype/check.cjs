// Run: node docs/design/mobile-work-prototype/check.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(`${__dirname}/index.html`, 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/render\(\);\s*$/, '');
const context = vm.createContext({
  URLSearchParams, location: { search: '?variant=C&role=owner' },
  document: { addEventListener() {}, querySelector() { return {}; } },
  window: { addEventListener() {} },
});
vm.runInContext(script, context);
const run = code => vm.runInContext(code, context);
const owner = run('ownerHome()');
assert.equal((run('nav()').match(/data-action="navigate"/g) || []).length, 5);
for (const label of ['กำลังคนวันนี้', 'งานครบกำหนดวันนี้ของทีม', 'นัดวันนี้ของสำนักงาน', 'ชุดเบิกที่ต้องจัดการ', 'คดีเปิด', 'เกินกำหนด', 'คำเตือน', 'รอฉันตรวจ 1 งาน', '2,250 ฿', '1,200 ฿']) {
  assert.ok(owner.includes(label), `Owner missing: ${label}`);
}
run("state.filter='all';state.memberRole='assistant'");
const member = run('tasksScreen()');
assert.ok(member.includes('ถ่ายเอกสารแนบและตรวจชื่อไฟล์'));
assert.ok(!member.includes('ติดตามเอกสารจากผู้ติดต่อ'));
run("state.memberRole=null;state.filter='overdue'");
assert.ok(run('tasksScreen()').includes('ตรวจรายการเอกสารให้ครบ'));
run("state.tasks.find(t=>t.id==='t2').status='DONE';state.tasks.find(t=>t.id==='t7').status='DONE'");
assert.ok(!run('tasksScreen()').includes('ตรวจรายการเอกสารให้ครบ'));
assert.ok(run('ownerHome()').includes('รอฉันตรวจ 0 งาน'));
run("state.tasks.find(t=>t.id==='t5').status='DONE'");
assert.ok(!run('ownerHome()').includes('คุณพิมลาวันนี้ แต่มีงานครบกำหนด'));
run("state.claimStatus='PENDING'");
assert.ok(run('claimsScreen()').includes('คุณอนันต์'));
assert.ok(!run('claimsScreen()').includes('คุณศิริพร'));
for (const role of ['senior', 'lawyer', 'assistant']) {
  run(`state.role='${role}'`);
  assert.ok(!run('claimsScreen()').includes('คุณอนันต์'));
  assert.equal((run('nav()').match(/data-action="navigate"/g) || []).length, 5);
}
run("state.role='owner';state.tasks=initialTasks();state.newDraft.assignee='assistant'");
assert.ok(run('assignmentRisks()').includes('มีวันลาที่อนุมัติวันนี้'));
assert.equal(run("memberFacts('senior').open.length"), 1);
assert.equal(run("memberFacts('senior').reviews"), 1);
assert.equal(run("memberFacts('lawyer').unknown"), 1);
assert.equal(run("memberFacts('lawyer').blockers.length"), 1);
assert.ok(run("capacityNote('lawyer')").includes('ยังสรุปว่าว่างไม่ได้'));
run("state.tasks=state.tasks.filter(t=>(t.sender||t.owner)!=='lawyer')");
assert.ok(run("capacityNote('lawyer')").includes('ไม่พบงานค้างในระบบ · ยังสรุปว่าว่างไม่ได้'));
run('state.tasks=initialTasks()');
run("state.taskId='t5';state.role='assistant'");
assert.equal(run('routineMissing(currentTask()).length'), 4);
run('currentTask().routineChecks=[true,true,true]');
assert.equal(run('routineMissing(currentTask()).length'), 1);
run("currentTask().attachments.push(routineFile(currentTask()));recordRoutineProgress(currentTask(),'รอต้นฉบับ')");
assert.equal(run('routineMissing(currentTask()).length'), 1);
run("recordRoutineProgress(currentTask(),'')");
assert.equal(run('routineMissing(currentTask()).length'), 0);
assert.equal(run("currentTask().dailyUpdate.remaining"), 'รอตรวจผลงาน');
assert.equal(run("routineFor(state.tasks.find(t=>t.id==='t1'))"), null);
console.log('Owner overview, member filters, workload warnings, role tabs and routine readiness passed');
