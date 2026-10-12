import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canHoldStatus, canSetReviewRequirements, handoffNoteError, isHeld, reviewerName, submittedByMe } from './task-review-view.ts';

const person = (id: string, firstName: string) => ({ id, firstName, lastName: 'ส.' });

test('my submitted work is mine while it waits for review', () => {
  assert.equal(submittedByMe({ status: 'PENDING_REVIEW', assignee: person('me', 'ก') } as any, 'me'), true);
  assert.equal(submittedByMe({ status: 'IN_PROGRESS', assignee: person('me', 'ก') } as any, 'me'), false);
});

test('the card names the real reviewer, else the case lead', () => {
  assert.equal(reviewerName({ reviewer: person('r', 'สมศรี') } as any, person('lead', 'หัวหน้า')), 'สมศรี ส.');
  assert.equal(reviewerName({ reviewer: null } as any, person('lead', 'หัวหน้า')), 'หัวหน้า ส.');
  assert.equal(reviewerName({ reviewer: null } as any), null);
});

test('held only while the hold is open', () => {
  assert.equal(isHeld({ onHold: { reason: 'รอศาล', endedAt: null } } as any), true);
  assert.equal(isHeld({ onHold: { reason: 'รอศาล', endedAt: '2026-10-01T00:00:00Z' } } as any), false);
  assert.equal(isHeld({ onHold: null } as any), false);
});

test('handoff note needs at least 5 non-blank characters', () => {
  assert.match(handoffNoteError('  ok ') ?? '', /5/);
  assert.equal(handoffNoteError('ร่างเสร็จแล้ว'), null);
});

test('only owner and senior lawyer may change review requirements', () => {
  assert.equal(canSetReviewRequirements('OWNER'), true);
  assert.equal(canSetReviewRequirements('SENIOR_LAWYER'), true);
  assert.equal(canSetReviewRequirements('OFFICE_MANAGER'), false);
  assert.equal(canSetReviewRequirements(undefined), false);
});

test('a case task with no named reviewer names the lead from its own case', () => {
  assert.equal(reviewerName({ reviewer: null, case: { leadLawyer: person('lead', 'หัวหน้า') } } as any, null), 'หัวหน้า ส.');
  assert.equal(reviewerName({ reviewer: person('r', 'สมศรี'), case: { leadLawyer: person('lead', 'หัวหน้า') } } as any), 'สมศรี ส.');
});

test('done or pending-review work cannot be put on hold', () => {
  assert.equal(canHoldStatus('IN_PROGRESS'), true);
  assert.equal(canHoldStatus('DONE'), false);
  assert.equal(canHoldStatus('PENDING_REVIEW'), false);
});
