import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isInvalidParts, parseIsoParts, partsToIso } from './thai-date.ts';

test('complete B.E. parts become an A.D. ISO date', () => {
  assert.equal(partsToIso({ d: '5', m: '3', yBe: '2569' }), '2026-03-05');
  assert.deepEqual(parseIsoParts('2026-03-05'), { d: '5', m: '3', yBe: '2569' });
});

test('incomplete parts give empty, so a stale date is not kept', () => {
  assert.equal(partsToIso({ d: '', m: '3', yBe: '2569' }), '');
  assert.equal(partsToIso({ d: '5', m: '3', yBe: '256' }), '');
});

test('B.E. year below 2500 is rejected (A.D. typed by mistake)', () => {
  assert.equal(partsToIso({ d: '5', m: '3', yBe: '2026' }), '');
  assert.equal(isInvalidParts({ d: '5', m: '3', yBe: '2026' }), true);
  assert.equal(isInvalidParts({ d: '5', m: '3', yBe: '2569' }), false);
  assert.equal(isInvalidParts({ d: '5', m: '3', yBe: '' }), false);
});

test('day past month end is clamped', () => {
  assert.equal(partsToIso({ d: '31', m: '2', yBe: '2569' }), '2026-02-28');
});
