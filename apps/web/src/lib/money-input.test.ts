import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { formatMoneyInput, normalizeMoneyInput } from './money-input.ts';
import { formatCurrency } from './utils.ts';

test('money fields display grouped baht while preserving the numeric value', () => {
  assert.equal(formatMoneyInput('50000'), '50,000');
  assert.equal(formatMoneyInput('50000.50'), '50,000.50');
  assert.equal(formatMoneyInput('50000.'), '50,000.');
  assert.equal(normalizeMoneyInput('฿๕๐,๐๐๐.๕๐'), '50000.50');
  assert.equal(normalizeMoneyInput('50,000'), '50000');
  assert.equal(normalizeMoneyInput('00050,000'), '50000');
  assert.equal(normalizeMoneyInput('.5'), '0.5');
  assert.equal(normalizeMoneyInput('50,000.123'), null);
  assert.equal(normalizeMoneyInput('50abc'), null);
  assert.equal(formatCurrency(50000), '฿50,000');
  assert.equal(formatCurrency(50000.555), '฿50,000.56');
});
