import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  blockPosition,
  closestDuration,
  findFirstFreeSlot,
  minutesToTime,
  nextWorkingDays,
  overlapsAny,
  snapMinutes,
  toMinuteRange,
} from './availability.ts';

test('toMinuteRange reads Bangkok minutes of the day and clamps to it', () => {
  assert.deepEqual(toMinuteRange({ start: '2026-10-14T02:00:00Z', end: '2026-10-14T03:30:00Z' }, '2026-10-14'), { start: 540, end: 630 });
  assert.deepEqual(toMinuteRange({ start: '2026-10-13T10:00:00Z', end: '2026-10-14T20:00:00Z' }, '2026-10-14'), { start: 0, end: 1440 });
  assert.equal(toMinuteRange({ start: '2026-10-15T02:00:00Z', end: '2026-10-15T03:00:00Z' }, '2026-10-14'), null);
});

test('overlapsAny is exclusive at the edges', () => {
  const busy = [{ start: 600, end: 660 }];
  assert.equal(overlapsAny({ start: 630, end: 690 }, busy), true);
  assert.equal(overlapsAny({ start: 660, end: 720 }, busy), false);
  assert.equal(overlapsAny({ start: 540, end: 600 }, busy), false);
});

test('blockPosition maps 08:00-19:00 to percentages and clamps', () => {
  assert.deepEqual(blockPosition({ start: 480, end: 1140 }), { left: 0, width: 100 });
  const p = blockPosition({ start: 480, end: 810 })!;
  assert.equal(p.left, 0);
  assert.equal(p.width, 50);
  assert.deepEqual(blockPosition({ start: 400, end: 500 }), { left: 0, width: (20 / 660) * 100 });
  assert.equal(blockPosition({ start: 1200, end: 1300 }), null);
});

test('findFirstFreeSlot merges busy lists and steps by 30 minutes', () => {
  const a = [{ start: 480, end: 600 }];
  const b = [{ start: 570, end: 660 }];
  assert.equal(findFirstFreeSlot([a, b], 60), 660);
  assert.equal(findFirstFreeSlot([a, b], 60, 700), 720);
  assert.equal(findFirstFreeSlot([], 60), 480);
  assert.equal(findFirstFreeSlot([[{ start: 480, end: 1140 }]], 30), null);
  assert.equal(findFirstFreeSlot([[{ start: 480, end: 1080 }]], 120), null);
  assert.equal(findFirstFreeSlot([[{ start: 480, end: 1080 }]], 60), 1080);
});

test('snapMinutes rounds down to 30 and stays in working hours', () => {
  assert.equal(snapMinutes(0.5), 810);
  assert.equal(snapMinutes(0), 480);
  assert.equal(snapMinutes(0.999), 1110);
});

test('minutesToTime / nextWorkingDays / closestDuration', () => {
  assert.equal(minutesToTime(545), '09:05');
  assert.deepEqual(nextWorkingDays('2026-10-16', 3), ['2026-10-19', '2026-10-20', '2026-10-21']);
  assert.deepEqual(nextWorkingDays('2026-10-16', 3, new Set(['2026-10-19', '2026-10-21'])), ['2026-10-20', '2026-10-22', '2026-10-23']);
  assert.equal(closestDuration('2026-10-14T02:00:00Z', '2026-10-14T03:40:00Z'), 90);
  assert.equal(closestDuration('2026-10-14T02:00:00Z', null), 60);
  assert.equal(closestDuration('2026-10-14T02:00:00Z', '2026-10-14T08:00:00Z'), 240);
});
