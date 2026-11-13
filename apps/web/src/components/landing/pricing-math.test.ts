import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { perPersonMonthly } from './pricing-math.ts';

test('per-person price uses the selected billing period', () => {
  assert.equal(perPersonMonthly(120, 3, false, 10), 40);
  assert.equal(perPersonMonthly(120, 3, true, 10), 33);
});
