import { test } from 'node:test';
import assert from 'node:assert/strict';
import { displayApiErrorMessage, rawApiErrorMessage } from './api-error-message.ts';

test('keeps Thai messages from the API', () => {
  assert.equal(displayApiErrorMessage('ทวงใบนี้ไปแล้วภายใน 24 ชม.', 400), 'ทวงใบนี้ไปแล้วภายใน 24 ชม.');
});

test('replaces English or code messages with Thai by status', () => {
  assert.match(displayApiErrorMessage('Insufficient permissions', 403), /ไม่มีสิทธิ์/);
  assert.match(displayApiErrorMessage('This sign-in link is invalid or has expired.', 410), /หมดอายุ/);
  assert.match(displayApiErrorMessage('TASK_LABELS_TOO_MANY', 400), /ตรวจช่องที่กรอก/);
  assert.match(displayApiErrorMessage('Internal Server Error', 503), /ขัดข้อง/);
});

test('reads every API message shape', () => {
  assert.equal(rawApiErrorMessage({ message: ['a', 'b'] }, 'x'), 'a, b');
  assert.equal(rawApiErrorMessage({ message: { message: 'nested' } }, 'x'), 'nested');
  assert.equal(rawApiErrorMessage({}, 'Bad Request'), 'Bad Request');
  assert.equal(rawApiErrorMessage(undefined, 'Bad Request'), 'Bad Request');
});
