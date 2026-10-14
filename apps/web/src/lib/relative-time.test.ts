import { test } from 'node:test';
import assert from 'node:assert/strict';
import { relativeTimeTh } from './relative-time.ts';

const now = new Date('2026-10-14T12:00:00Z');
test('relativeTimeTh', () => {
  assert.equal(relativeTimeTh(null, now), 'ยังไม่เคยซิงก์');
  assert.equal(relativeTimeTh('2026-10-14T11:59:30Z', now), 'เมื่อสักครู่');
  assert.equal(relativeTimeTh('2026-10-14T11:55:00Z', now), '5 นาทีที่แล้ว');
  assert.equal(relativeTimeTh('2026-10-14T09:00:00Z', now), '3 ชม.ที่แล้ว');
  assert.equal(relativeTimeTh('2026-10-12T12:00:00Z', now), '2 วันที่แล้ว');
});
