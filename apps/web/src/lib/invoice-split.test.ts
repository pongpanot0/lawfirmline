import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { allocateShares } from './invoice-split.ts';

describe('allocateShares', () => {
  it('splits by the given shares', () => {
    assert.deepEqual(allocateShares(100000, [60, 40]), [60000, 40000]);
  });

  it('keeps the total exact when the split does not divide evenly', () => {
    const parts = allocateShares(100000, [33.33, 33.33, 33.34]);
    assert.equal(parts.reduce((sum, part) => sum + part, 0), 100000);
  });

  it('treats equal shares as an even split whatever their scale', () => {
    assert.deepEqual(allocateShares(300, [1, 1, 1]), [100, 100, 100]);
  });

  it('gives everything to the only payer', () => {
    assert.deepEqual(allocateShares(1234.56, [100]), [1234.56]);
  });

  it('returns zeros rather than NaN when every share is zero', () => {
    assert.deepEqual(allocateShares(1000, [0, 0]), [0, 0]);
  });
});
