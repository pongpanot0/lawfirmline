import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { remainingCount, stepLabel, canChangeOwner } from './case-journey-helpers.ts';

test('counts unfinished checklist items and unskipped tasks', () => {
  assert.equal(remainingCount([{ state: 'done' }, { state: 'current' }], [{ status: 'TODO', skippedReason: null }, { status: 'TODO', skippedReason: 'เหตุผล' }, { status: 'DONE', skippedReason: null }]), 2);
});
test('distinguishes skipped opening stages', () => {
  assert.equal(stepLabel({ state: 'done', skippedAtOpen: true }), 'ข้ามตอนเปิดคดี');
  assert.equal(stepLabel({ state: 'done' }), 'เสร็จแล้ว');
  assert.equal(stepLabel({ state: 'current' }), 'กำลังทำ');
});
test('only owner capability or receiver who is lead may hand over', () => {
  assert.equal(canChangeOwner(false, 'a', 'a', 'a'), true);
  assert.equal(canChangeOwner(false, 'a', 'b', 'a'), false);
  assert.equal(canChangeOwner(false, undefined, 'a', null), false);
  assert.equal(canChangeOwner(true, 'b', 'a', null), true);
});
