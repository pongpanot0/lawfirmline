import assert from 'node:assert/strict';
import { test } from 'node:test';
import { caseNumberDisplay } from './case-number-display.ts';

test('shows a court case number or the table placeholder', () => {
  assert.equal(caseNumberDisplay('  ผบ.123/2569  '), 'ผบ.123/2569');
  assert.equal(caseNumberDisplay(null), '—');
  assert.equal(caseNumberDisplay(''), '—');
});
