import assert from 'node:assert/strict';
import { test } from 'node:test';
import { actionSuccessMessage } from './action-feedback.ts';

test('toasts say what happened instead of a generic "saved"', () => {
  assert.equal(actionSuccessMessage('POST', '/cases'), 'เปิดคดีแล้ว');
  assert.equal(actionSuccessMessage('POST', '/cases/c1/tasks'), 'เพิ่มงานแล้ว');
  assert.equal(actionSuccessMessage('PATCH', '/cases/c1/tasks/t1', JSON.stringify({ status: 'DONE' })), 'ทำงานเสร็จแล้ว');
  assert.equal(actionSuccessMessage('PATCH', '/cases/c1/tasks/t1', JSON.stringify({ title: 'x' })), 'บันทึกงานแล้ว');
  assert.equal(actionSuccessMessage('POST', '/calendar/events'), 'บันทึกนัดแล้ว');
  assert.equal(actionSuccessMessage('PATCH', '/expense-claims/k1/status', JSON.stringify({ status: 'APPROVED' })), 'อนุมัติใบเบิกแล้ว');
  assert.equal(actionSuccessMessage('PATCH', '/leaves/l1/decision', JSON.stringify({ decision: 'REJECTED' })), 'ไม่อนุมัติการลาแล้ว');
  assert.equal(actionSuccessMessage('POST', '/something/else'), 'บันทึกแล้ว');
  assert.equal(actionSuccessMessage('DELETE', '/clients/c1'), 'ลบแล้ว');
  assert.equal(actionSuccessMessage('POST'), 'บันทึกแล้ว');
});
