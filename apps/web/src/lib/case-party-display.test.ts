import assert from 'node:assert/strict';
import { test } from 'node:test';
import { caseClientName, casePartyDisplay } from './case-party-display.ts';

const participants = [
  { name: 'บริษัท เอ', role: 'PLAINTIFF' },
  { name: 'นาย บี', role: 'JOINT_PLAINTIFF' },
  { name: 'บริษัท ซี', role: 'DEFENDANT' },
  { name: 'นาย ดี', role: 'WITNESS' },
];

test('separates plaintiffs and defendants while retaining joint parties', () => {
  assert.equal(casePartyDisplay(participants, 'plaintiff'), 'บริษัท เอ, นาย บี');
  assert.equal(casePartyDisplay(participants, 'defendant'), 'บริษัท ซี');
  assert.equal(casePartyDisplay([], 'defendant'), '—');
});

test('caseClientName hides the no-client placeholder', () => {
  assert.equal(caseClientName('tmp'), null);
  assert.equal(caseClientName('  '), null);
  assert.equal(caseClientName(null), null);
  assert.equal(caseClientName(' บริษัท เอ '), 'บริษัท เอ');
});
