import { test } from 'node:test';
import assert from 'node:assert/strict';
import { licenseBadge } from './license-badge.ts';

const today = new Date('2026-11-02T03:00:00.000Z'); // 10:00 Bangkok

test('no badge without an expiry date (lifetime or unset)', () => {
  assert.equal(licenseBadge(null, today), null);
});

test('no badge when more than 90 days remain', () => {
  assert.equal(licenseBadge('2027-02-01', today), null);
});

test('ใกล้หมด within 90 days, counting Bangkok days', () => {
  assert.deepEqual(licenseBadge('2027-01-31', today), { label: 'ใกล้หมด (90 วัน)', variant: 'warning' });
  assert.deepEqual(licenseBadge('2026-11-02', today), { label: 'ใกล้หมด (0 วัน)', variant: 'warning' });
});

test('หมดอายุ once the date has passed', () => {
  assert.deepEqual(licenseBadge('2026-11-01', today), { label: 'หมดอายุ', variant: 'destructive' });
});

test('17:30Z is already the next Bangkok day', () => {
  assert.deepEqual(licenseBadge('2026-11-01', new Date('2026-10-31T17:30:00.000Z')), { label: 'ใกล้หมด (0 วัน)', variant: 'warning' });
});
