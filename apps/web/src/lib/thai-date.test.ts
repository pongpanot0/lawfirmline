import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isInvalidParts, isPartialParts, parseIsoParts, partsToIso } from './thai-date.ts';

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

test('a day that does not exist in the month is invalid, not clamped', () => {
  assert.equal(partsToIso({ d: '31', m: '2', yBe: '2569' }), '');
  assert.equal(partsToIso({ d: '30', m: '2', yBe: '2567' }), '');
  assert.equal(partsToIso({ d: '31', m: '4', yBe: '2569' }), '');
  assert.equal(isInvalidParts({ d: '31', m: '4', yBe: '2569' }), true);
  assert.equal(partsToIso({ d: '29', m: '2', yBe: '2567' }), '2024-02-29');
  assert.equal(isInvalidParts({ d: '29', m: '2', yBe: '2569' }), true);
});

test('partially typed dates are partial; empty and complete are not', () => {
  assert.equal(isPartialParts({ d: '5', m: '3', yBe: '' }), true);
  assert.equal(isPartialParts({ d: '5', m: '3', yBe: '256' }), true);
  assert.equal(isPartialParts({ d: '', m: '', yBe: '2569' }), true);
  assert.equal(isPartialParts({ d: '', m: '', yBe: '' }), false);
  assert.equal(isPartialParts({ d: '5', m: '3', yBe: '2569' }), false);
});
