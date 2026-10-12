import { test } from 'node:test';
import assert from 'node:assert/strict';
import { additionalClientsPatch, dedupeClientIds, limitationPatch } from './case-overview.ts';

test('limitation date is sent only when it changed; blank-after-set clears', () => {
  assert.deepEqual(limitationPatch('2027-03-01', '2027-03-01'), {});
  assert.deepEqual(limitationPatch('', ''), {});
  assert.deepEqual(limitationPatch('', '2027-03-01'), { limitationDeadline: null });
  assert.deepEqual(limitationPatch('2027-03-02', '2027-03-01'), { limitationDeadline: '2027-03-01T17:00:00.000Z' });
});

test('dedupeClientIds drops blanks, repeats and the primary client', () => {
  assert.deepEqual(dedupeClientIds(['a', '', 'b', 'a', 'p'], 'p'), ['a', 'b']);
});

test('additional clients are sent only when the id set changed, carrying notes', () => {
  const current = [{ clientId: 'a', note: 'ญาติ' }, { clientId: 'b', note: null }];
  assert.deepEqual(additionalClientsPatch(['b', 'a'], current, ''), {});
  assert.deepEqual(additionalClientsPatch(['a', '', 'a'], current, ''), { clients: [{ clientId: 'a', note: 'ญาติ' }] });
  assert.deepEqual(additionalClientsPatch(['a', 'b', 'c'], current, ''), {
    clients: [{ clientId: 'a', note: 'ญาติ' }, { clientId: 'b' }, { clientId: 'c' }],
  });
  assert.deepEqual(additionalClientsPatch([], current, ''), { clients: [] });
  assert.deepEqual(additionalClientsPatch([], [], ''), {});
});
