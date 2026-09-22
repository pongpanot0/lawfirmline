import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CaseStatus } from '@lawfirm/shared';
import { buildCasePrintHtml, casePrintDefaults } from './case-print-forms.ts';
import type { CaseDetail } from './api.ts';

test('forms preserve party roles and blank unknowns, escape text, and keep private values out of the other form', () => {
  const c = { ownRef: 'TEST-1', claimedAmount: 0, clientName: 'ลูกความไม่ใช่โจทก์เสมอ', leadLawyer: { firstName: 'ทนาย', lastName: 'ทดสอบ' }, participants: [
    { role: 'PLAINTIFF', name: 'โจทก์' }, { role: 'DEFENDANT', name: 'จำเลยที่ 1' }, { role: 'JOINT_DEFENDANT', name: 'จำเลยร่วม' },
  ] } as CaseDetail;
  const values = casePrintDefaults(c, 'สำนักงาน');
  assert.equal(values.plaintiff, 'โจทก์');
  assert.equal(values.defendant, 'จำเลยที่ 1');
  assert.equal(values.jointDefendant, 'จำเลยร่วม');
  assert.equal(values.blackNumber, '');
  assert.equal(values.filedDate, '');
  assert.equal(values.amount, '0');
  const filled = casePrintDefaults({ ...c, blackCaseNumber: 'ผบ.407/2569', redCaseNumber: 'ผบ.500/2569', courtName: 'ศาลแพ่งกรุงเทพใต้', participants: c.participants!.map(p => ({ ...p, address: `${p.name} ที่อยู่`, phone: '021234567', email: 'test@example.com' })) }, 'สำนักงาน');
  assert.equal(filled.blackNumber, 'ผบ.407/2569');
  assert.equal(filled.redNumber, 'ผบ.500/2569');
  assert.equal(filled.court, 'ศาลแพ่งกรุงเทพใต้');
  assert.equal(filled.plaintiffAddress, 'โจทก์ ที่อยู่');
  assert.equal(filled.defendantAddress, 'จำเลยที่ 1 ที่อยู่');
  assert.equal(filled.plaintiffContact, '021234567 / test@example.com');
  assert.equal(casePrintDefaults({ ...c, participants: [] }, '').plaintiff, '');
  values.firstParagraph = '<script>alert("x")</script> ข้อ ๑. ข้อเท็จจริง';
  values.plaintiffIdentity = 'ข้อมูลส่วนบุคคลเฉพาะคำฟ้อง';
  const complaint = buildCasePrintHtml('complaint', values, 'https://example.com/tracker.png');
  assert.ok(complaint.includes('&lt;script&gt;'));
  assert.ok(!complaint.includes('<script>'));
  assert.ok(!complaint.includes('tracker.png'));
  assert.ok(complaint.includes('ข้อ ๑. ข้อเท็จจริง'));
  const cover = buildCasePrintHtml('cover', values);
  assert.ok(cover.includes('สำนวนคดี'));
  assert.ok(cover.includes('12.'));
  assert.ok(!cover.includes(values.plaintiffIdentity));
  assert.ok(!cover.includes('ข้อ ๑. ข้อเท็จจริง'));
  assert.ok(cover.includes('@page{size:A4 portrait'));
});

test('both documents use the saved charge, while missing or malformed legacy values stay blank', () => {
  const c: CaseDetail = {
    id: 'test-case', ownRef: 'TEST', title: 'ทดสอบ', status: CaseStatus.OPEN,
    openedAt: '2026-09-22T00:00:00Z', assignments: [], tasks: [], participants: [],
    _count: { tasks: 0, documents: 0 },
    leadLawyer: { id: 'lawyer', firstName: 'ทนาย', lastName: 'ทดสอบ', email: 'test@example.com' },
    customFields: { chargeSection: '  ละเมิด เรียกค่าเสียหาย  ', unrelated: 'keep' },
  };
  const values = casePrintDefaults(c, 'สำนักงาน');
  assert.equal(values.subject, 'ละเมิด เรียกค่าเสียหาย');
  for (const kind of ['cover', 'complaint'] as const) assert.ok(buildCasePrintHtml(kind, values).includes(values.subject));
  assert.equal(casePrintDefaults({ ...c, customFields: { chargeSection: 123 } }, '').subject, '');
  assert.equal(casePrintDefaults({ ...c, customFields: null }, '').subject, '');
});
