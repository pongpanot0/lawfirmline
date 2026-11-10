import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupProposals, parseOtherAmount, parseDocument, submitHelper, casePath } from './email-intake.ts';
import type { IntakeFieldProposalItem, EmailIntakeStep } from './api';

test('groups proposals by matter including general data', () => {
  const rows = [{ matterLabel: 'A' }, { matterLabel: null }, { matterLabel: 'A' }] as IntakeFieldProposalItem[];
  assert.deepEqual(groupProposals(rows).map(([key, values]) => [key, values.length]), [['A', 2], [null, 1]]);
});
test('parses amount and document safely', () => {
  assert.deepEqual(parseOtherAmount('{"label":"ค่ารักษา","amount":0}'), { label: 'ค่ารักษา', amount: 0 });
  assert.equal(parseOtherAmount('{"label":"x","amount":"5"}'), null);
  assert.equal(parseOtherAmount('bad'), null);
  assert.equal(parseDocument('{"documentId":"d","filename":"a.pdf","docTypeLabel":"เวชระเบียน","category":"MEDICAL","docRequestId":null}')?.documentId, 'd');
  assert.equal(parseDocument('{"documentId":5}'), null);
});
test('submit helper lists incomplete required steps', () => {
  const steps = [{ key: 'CONFIRM', label: 'ตรวจข้อมูล', state: 'done' }, { key: 'DOCUMENTS', label: 'จัดเอกสาร', state: 'current' }] as EmailIntakeStep[];
  assert.equal(submitHelper(steps), 'ต้องทำให้ครบก่อน: จัดเอกสาร');
  steps[1].state = 'done';
  assert.equal(submitHelper(steps), 'พร้อมสร้างคดีก่อนฟ้อง');
});

test('links acceptance and assessment to the linked case', () => {
  assert.equal(casePath('case-123'), '/cases/case-123');
  assert.equal(casePath(null), null);
});
