import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paperFileMovementInput } from './paper-file.ts';

const fields = { holderUserId: '', location: ' ตู้ A ชั้น 2 ', note: ' ส่งศาล ' };

test('checkout defaults to the signed-in user and allows a selected member', () => {
  assert.deepEqual(paperFileMovementInput('CHECK_OUT', fields), { action: 'CHECK_OUT', holderUserId: undefined, note: 'ส่งศาล' });
  assert.deepEqual(paperFileMovementInput('CHECK_OUT', { ...fields, holderUserId: 'member-1' }), { action: 'CHECK_OUT', holderUserId: 'member-1', note: 'ส่งศาล' });
});

test('check-in and move require a nonblank location and never send a holder', () => {
  for (const action of ['CHECK_IN', 'MOVE'] as const) {
    assert.deepEqual(paperFileMovementInput(action, fields), { action, location: 'ตู้ A ชั้น 2', note: 'ส่งศาล' });
    assert.throws(() => paperFileMovementInput(action, { ...fields, location: '  ' }), /กรุณาระบุที่เก็บสำนวน/);
  }
});

test('leaves an empty optional note out of the API payload', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(paperFileMovementInput('CHECK_OUT', { ...fields, note: '  ' }))), { action: 'CHECK_OUT' });
});
