import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { allowedStageChange } from './allowed-stage-change.ts';

test('stage choices follow the journey and allow backward corrections', () => {
  assert.equal(allowedStageChange('PRE_LITIGATION', 'FILING'), true);
  assert.equal(allowedStageChange('PRE_LITIGATION', 'HEARING'), false);
  assert.equal(allowedStageChange('PRE_LITIGATION', 'SUPREME'), false);
  assert.equal(allowedStageChange('HEARING', 'FILING'), true);
  assert.equal(allowedStageChange('AWAITING_JUDGMENT', 'APPEAL'), true);
  assert.equal(allowedStageChange('AWAITING_JUDGMENT', 'SUPREME'), false);
  assert.equal(allowedStageChange('APPEAL', 'SUPREME'), true);
  assert.equal(allowedStageChange('APPEAL', 'ENFORCEMENT'), true);
  assert.equal(allowedStageChange('FILING', 'CLOSING'), true);
  assert.equal(allowedStageChange('FACT_GATHERING', 'FILING'), true);
});
