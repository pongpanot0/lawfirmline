import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bangkokDateInputToIso,
  bangkokDateInputValue,
  bangkokDayLabel,
  bangkokInputToIso,
  bangkokInputValue,
  bangkokTime,
} from './bangkok.ts';

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

test('fills a datetime-local input with the Bangkok wall clock, not UTC', () => {
  // The instant a 09:00 Bangkok hearing happens at.
  assert.equal(bangkokInputValue('2026-09-07T02:00:00Z'), '2026-09-07T09:00');
});

test('keeps a late-evening event on its own Bangkok day', () => {
  // 22:30 Bangkok on the 7th is still the 7th, though it is the 15:30Z instant.
  assert.equal(bangkokInputValue('2026-09-07T15:30:00Z'), '2026-09-07T22:30');
  // 00:30 Bangkok on the 8th is 17:30Z on the 7th — the UTC slice would say 7th.
  assert.equal(bangkokInputValue('2026-09-07T17:30:00Z'), '2026-09-08T00:30');
});

test('reads a datetime-local value as Bangkok time', () => {
  assert.equal(bangkokInputToIso('2026-09-07T09:00'), '2026-09-07T02:00:00.000Z');
  assert.equal(bangkokInputToIso('2026-09-08T00:30'), '2026-09-07T17:30:00.000Z');
});

test('round-trips an instant through the input and back unchanged', () => {
  for (const iso of ['2026-09-07T02:00:00.000Z', '2026-12-31T17:00:00.000Z', '2026-01-01T00:00:00.000Z']) {
    assert.equal(bangkokInputToIso(bangkokInputValue(iso)), iso);
  }
});

test('reads a date-only input as Bangkok midnight', () => {
  assert.equal(bangkokDateInputToIso('2026-09-08'), '2026-09-07T17:00:00.000Z');
  assert.equal(bangkokDateInputValue('2026-09-07T17:30:00Z'), '2026-09-08');
});
