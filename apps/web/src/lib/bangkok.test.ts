import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bangkokDayLabel, bangkokTime } from './bangkok.ts';

test('shows the Bangkok wall clock, not UTC', () => {
  assert.equal(bangkokTime('2026-09-07T02:00:00Z'), '09:00');
});

test('shows the Bangkok time even when the instant is the previous UTC day', () => {
  // 18:30Z is 01:30 the next morning in Bangkok.
  assert.equal(bangkokTime('2026-09-07T18:30:00Z'), '01:30');
});

test('labels a day key as itself, without shifting it a day back', () => {
  // Read as a Bangkok calendar day, 2026-09-08 is a Tuesday.
  assert.match(bangkokDayLabel('2026-09-08', 'en-US'), /Tue/);
  assert.match(bangkokDayLabel('2026-09-08', 'en-US'), /8/);
});
