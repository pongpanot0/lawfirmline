import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { nextBangkokMonth, savingsPercent } from './usageMath.ts';

test('savings round down against the smallest pack', () => {
  assert.equal(savingsPercent(99, 100, 399, 500), 19);
  assert.equal(savingsPercent(99, 10, 590, 100), 40);
  assert.equal(savingsPercent(99, 100, 99, 100), 0);
});
test('reset month follows Bangkok at the year boundary', () => {
  assert.equal(nextBangkokMonth(new Date('2026-12-31T16:59:59Z')).toISOString(), '2027-01-01T00:00:00.000Z');
  assert.equal(nextBangkokMonth(new Date('2026-12-31T17:00:00Z')).toISOString(), '2027-02-01T00:00:00.000Z');
});
