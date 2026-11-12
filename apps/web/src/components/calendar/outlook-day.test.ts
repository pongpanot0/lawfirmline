import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { outlookDay } from './outlook-day.ts';

test('all-day Outlook events use their UTC date while timed events use Bangkok', () => {
  assert.equal(outlookDay({ isAllDay: true, startAt: '2026-11-12T00:00:00.000Z' }), '2026-11-12');
  assert.equal(outlookDay({ isAllDay: false, startAt: '2026-11-12T18:00:00.000Z' }), '2026-11-13');
});
