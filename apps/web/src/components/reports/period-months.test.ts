import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { periodMonths } from './period-months.ts';

test('selects Bangkok months including the previous year and elapsed quarter', () => {
  const january = new Date('2026-12-31T18:00:00Z');
  assert.deepEqual(periodMonths('last_month', january), ['2026-12']);
  assert.deepEqual(periodMonths('year', january), ['2027-01']);
  assert.deepEqual(periodMonths('quarter', new Date('2026-11-11T00:00:00Z')), ['2026-10', '2026-11']);
});
