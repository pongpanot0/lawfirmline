import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { courtFeeNeedsClaim } from './court-fee-fields.ts';

test('only the four fixed or exempt kinds hide the claim amount', () => {
  for (const kind of ['NON_MONETARY', 'CONSUMER', 'LABOUR', 'BANKRUPTCY'] as const) assert.equal(courtFeeNeedsClaim(kind), false);
  for (const kind of ['GENERAL', 'MIXED', 'SMALL_CLAIM', 'ARBITRATION_DOMESTIC', 'ARBITRATION_FOREIGN', 'MORTGAGE', 'ADMIN'] as const) assert.equal(courtFeeNeedsClaim(kind), true);
});
