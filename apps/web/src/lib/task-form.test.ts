import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workloadLabel } from './workload-label.ts';
import { getMentionContext, mentionedIdsIn } from './mentions.ts';

test('workload hint reads like the case create form', () => {
  assert.equal(workloadLabel({ leadCount: 3, buddyCount: 1, nearDeadlineCount: 2 }), ' (หลัก 3, ผู้ช่วย 1, ใกล้ deadline 2)');
  assert.equal(workloadLabel(undefined), '');
});

test('mention context is the word after the last @ up to the cursor', () => {
  assert.deepEqual(getMentionContext('ฝาก @สม', 7), { startIdx: 5, query: 'สม' });
  assert.equal(getMentionContext('ฝาก @สม ชาย', 11), null);
  assert.equal(getMentionContext('ไม่มี', 5), null);
});

test('only people still named in the body count as mentioned', () => {
  const picked = [{ id: 'a', firstName: 'สมชาย', lastName: 'ใจดี' }, { id: 'b', firstName: 'สมหญิง', lastName: 'รักงาน' }];
  assert.deepEqual(mentionedIdsIn('@สมชาย ช่วยดูข้อ 3', picked), ['a']);
});
