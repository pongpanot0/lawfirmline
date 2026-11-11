import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { barHeight } from './bar-height.ts';

test('places positive and negative values on opposite sides of zero', () => {
  assert.equal(barHeight(50, 100, 'positive'), 50);
  assert.equal(barHeight(50, 100, 'negative'), 0);
  assert.equal(barHeight(-25, 100, 'positive'), 0);
  assert.equal(barHeight(-25, 100, 'negative'), 25);
  assert.equal(barHeight(0, 0, 'positive'), 0);
});
