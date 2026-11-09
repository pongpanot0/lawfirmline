import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { mailDateGroup } from './journey-mail.ts';

test('groups mail by local calendar date', () => {
  const now = new Date(2026, 10, 9, 12);
  assert.equal(mailDateGroup(new Date(2026, 10, 9, 1), now), 'วันนี้');
  assert.equal(mailDateGroup(new Date(2026, 10, 8, 23), now), 'เมื่อวาน');
  assert.equal(mailDateGroup(new Date(2026, 10, 4), now), 'สัปดาห์นี้');
  assert.equal(mailDateGroup(new Date(2026, 9, 1), now), 'เก่ากว่า');
});
