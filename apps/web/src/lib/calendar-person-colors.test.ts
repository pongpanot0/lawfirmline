import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calendarPersonColors, eventPersonId } from './calendar-person-colors.ts';

test('roster colors are unique and independent of input order', () => {
  const ids = Array.from({ length: 25 }, (_, i) => `person-${i}`);
  const colors = calendarPersonColors(ids);
  assert.equal(new Set(colors.values()).size, ids.length);
  assert.deepEqual(colors, calendarPersonColors([...ids].reverse()));
});
test('explicit assignee takes precedence over case lead, otherwise use lead or unassigned', () => {
  assert.equal(eventPersonId({ assigneeId: 'a', case: { leadLawyer: { id: 'b' } } }), 'a');
  assert.equal(eventPersonId({ case: { leadLawyer: { id: 'b' } } }), 'b');
  assert.equal(eventPersonId({}), null);
});
