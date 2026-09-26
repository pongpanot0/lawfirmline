import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calendarPersonColors, eventPeopleIds, eventPersonId } from './calendar-person-colors.ts';

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

test('eventPeopleIds prefers assignee rows over the legacy single assignee or the lead', () => {
  assert.deepEqual(
    eventPeopleIds({ assignees: [{ userId: 'a' }, { userId: 'b' }], assigneeId: 'a', case: { leadLawyer: { id: 'c' } } }),
    ['a', 'b'],
  );
});

test('eventPeopleIds falls back to assigneeId when there are no assignee rows', () => {
  assert.deepEqual(eventPeopleIds({ assignees: [], assigneeId: 'a', case: { leadLawyer: { id: 'c' } } }), ['a']);
});

test('eventPeopleIds falls back to the case lead when there is no assignee at all', () => {
  assert.deepEqual(eventPeopleIds({ case: { leadLawyer: { id: 'c' } } }), ['c']);
  assert.deepEqual(eventPeopleIds({}), []);
});
