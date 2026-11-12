import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { outlookDay, outlookDays } from './outlook-day.ts';

test('all-day Outlook events use their UTC date while timed events use Bangkok', () => {
  assert.equal(outlookDay({ isAllDay: true, startAt: '2026-11-12T00:00:00.000Z' }), '2026-11-12');
  assert.equal(outlookDay({ isAllDay: false, startAt: '2026-11-12T18:00:00.000Z' }), '2026-11-13');
});

test('a multi-day all-day event appears on every day up to its exclusive end', () => {
  assert.deepEqual(outlookDays({ isAllDay: true, startAt: '2026-11-09T00:00:00.000Z', endAt: '2026-11-14T00:00:00.000Z' }), ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13']);
  assert.deepEqual(outlookDays({ isAllDay: true, startAt: '2026-11-12T00:00:00.000Z', endAt: '2026-11-13T00:00:00.000Z' }), ['2026-11-12']);
  assert.deepEqual(outlookDays({ isAllDay: false, startAt: '2026-11-12T18:00:00.000Z', endAt: '2026-11-12T19:00:00.000Z' }), ['2026-11-13']);
});
