import { test } from 'node:test';
import assert from 'node:assert/strict';
import { awaitingReplyLabel } from './email-awaiting.ts';

const now = Date.parse('2026-10-14T12:00:00Z');
const ago = (h: number) => new Date(now - h * 3_600_000).toISOString();

test('hours under 48, days from 48', () => {
  assert.equal(awaitingReplyLabel(ago(0), now), 'รอตอบ 1 ชม.');
  assert.equal(awaitingReplyLabel(ago(25), now), 'รอตอบ 25 ชม.');
  assert.equal(awaitingReplyLabel(ago(47.9), now), 'รอตอบ 47 ชม.');
  assert.equal(awaitingReplyLabel(ago(48), now), 'รอตอบ 2 วัน');
  assert.equal(awaitingReplyLabel(ago(100), now), 'รอตอบ 4 วัน');
});
