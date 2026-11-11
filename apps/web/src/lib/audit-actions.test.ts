import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { auditActionText } from './audit-actions.ts';

test('renders a known action in Thai and keeps unknown actions visible', () => {
  assert.equal(auditActionText('USER_LOGIN'), 'เข้าสู่ระบบ');
  assert.equal(auditActionText('NEW_ACTION'), 'ทำรายการ NEW_ACTION');
});
