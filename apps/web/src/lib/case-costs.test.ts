import { test } from 'node:test';
import assert from 'node:assert/strict';
import { caseCostTotal, readCaseCosts } from './case-costs';

test('adds court visits and other charges using integer satang', () => {
  const result = caseCostTotal([
    { label: 'court visits', quantity: '3', rate: '1000' },
    { label: 'travel', quantity: '2', rate: '150.25' },
    { label: 'copies', quantity: '3', rate: '0.10' },
  ]);
  assert.equal(result.totalCents, 330080);
  assert.equal(result.incomplete, false);
});
test('blank rates remain unknown, while explicit zero is valid', () => {
  assert.equal(
    caseCostTotal([{ label: 'fee', quantity: '1', rate: '' }]).incomplete,
    true,
  );
  assert.equal(
    caseCostTotal([{ label: 'fee', quantity: '1', rate: '0' }]).incomplete,
    false,
  );
});
test('rejects negative, fractional quantity, excess precision and invalid values', () => {
  for (const [quantity, rate] of [
    ['-1', '100'],
    ['1.5', '100'],
    ['1', '-100'],
    ['1', '1.001'],
    ['1001', '1'],
    ['1', 'NaN'],
  ]) {
    assert.equal(
      caseCostTotal([{ label: 'fee', quantity, rate }]).incomplete,
      true,
    );
  }
});
test('round trips estimates and tolerates malformed legacy data', () => {
  const lines = [{ label: 'visits', quantity: '2', rate: '900' }];
  assert.deepEqual(readCaseCosts(JSON.stringify(lines)), lines);
  assert.ok(readCaseCosts('{broken').length > 0);
});
