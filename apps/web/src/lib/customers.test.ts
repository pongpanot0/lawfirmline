import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatCustomers, customersSameAsClient } from './customers.ts';

const row = (id: string, name: string, sharePercent: number | null = null) => ({
  id: `row-${id}`,
  customerId: id,
  sharePercent,
  isPrimary: false,
  note: null,
  customer: { id, name },
});

describe('formatCustomers', () => {
  it('returns null when the case has no customer', () => {
    assert.equal(formatCustomers([]), null);
    assert.equal(formatCustomers(undefined), null);
  });

  it('drops the share when there is only one customer paying', () => {
    assert.equal(formatCustomers([row('a', 'วิริยะ', 100)]), 'วิริยะ');
  });

  it('lists every payer with its share', () => {
    assert.equal(
      formatCustomers([row('a', 'วิริยะ', 60), row('b', 'กรุงเทพประกันภัย', 40)]),
      'วิริยะ 60% · กรุงเทพประกันภัย 40%',
    );
  });

  it('keeps a payer whose share is not agreed yet', () => {
    assert.equal(
      formatCustomers([row('a', 'วิริยะ', 60), row('b', 'บริษัท ข')]),
      'วิริยะ 60% · บริษัท ข',
    );
  });
});

describe('customersSameAsClient', () => {
  it('is true for the ordinary case where the client pays for itself', () => {
    assert.equal(customersSameAsClient([row('a', 'นาย A')], 'a'), true);
  });

  it('is false when an insurer pays for the client', () => {
    assert.equal(customersSameAsClient([row('viriyah', 'วิริยะ')], 'client-a'), false);
  });

  it('is false when several companies share the bill', () => {
    assert.equal(customersSameAsClient([row('a', 'A'), row('b', 'B')], 'a'), false);
  });

  it('is false when the case has no client at all', () => {
    assert.equal(customersSameAsClient([row('a', 'A')], null), false);
  });
});
