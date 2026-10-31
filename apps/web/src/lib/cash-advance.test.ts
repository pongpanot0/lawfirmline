import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canReturnCashAdvance, canSettleCashAdvance } from './cash-advance.ts';

test('returns accept a positive amount up to the open balance', () => {
  const advance = { remaining: 125.50, settledAt: null };
  assert.equal(canReturnCashAdvance(advance, 0.01), true);
  assert.equal(canReturnCashAdvance(advance, 125.50), true);
  for (const amount of [0, -1, 125.51, NaN, Infinity]) {
    assert.equal(canReturnCashAdvance(advance, amount), false);
  }
});

test('zero balances and settled advances cannot receive returns', () => {
  assert.equal(canReturnCashAdvance({ remaining: 0, settledAt: null }, 1), false);
  assert.equal(canReturnCashAdvance({ remaining: 100, settledAt: '2026-10-31' }, 1), false);
});

test('only an unsettled advance with exactly zero remaining can settle', () => {
  assert.equal(canSettleCashAdvance({ remaining: 0, settledAt: null }), true);
  for (const remaining of [0.01, 100, -0.01, NaN, Infinity]) {
    assert.equal(canSettleCashAdvance({ remaining, settledAt: null }), false);
  }
  assert.equal(canSettleCashAdvance({ remaining: 0, settledAt: '2026-10-31' }), false);
});
