import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCourtDayDraft } from './court-day-draft.ts';
const state = {
  checklist: [],
  taskIds: [],
  documents: [],
  notes: 'draft',
  outcome: '',
  nextTitle: '',
  nextAt: '',
  taskTitle: '',
  taskDue: '',
  amount: '',
  nextHearing: false,
  followUp: false,
  expense: false,
  clientDraft: true,
};
test('court drafts reject expired, malformed and invalid-date browser data', () => {
  const now = 100000000;
  const encode = (patch = {}) =>
    JSON.stringify({ version: 2, savedAt: now, state, ...patch });
  assert.equal(parseCourtDayDraft(encode(), now)?.state.notes, 'draft');
  assert.equal(
    parseCourtDayDraft(encode({ savedAt: now - 86400001 }), now),
    null,
  );
  assert.equal(
    parseCourtDayDraft(encode({ state: { ...state, checklist: [null] } }), now),
    null,
  );
  assert.equal(
    parseCourtDayDraft(encode({ state: { ...state, nextAt: 'invalid' } }), now),
    null,
  );
  assert.equal(
    parseCourtDayDraft(
      encode({ state: { ...state, documents: [{ id: 'doc', version: 0 }] } }),
      now,
    ),
    null,
  );
  assert.equal(parseCourtDayDraft('broken', now), null);
});
