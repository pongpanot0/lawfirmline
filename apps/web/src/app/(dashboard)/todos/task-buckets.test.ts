import assert from 'node:assert/strict';
import { test } from 'node:test';
import { taskBucket } from './task-buckets.ts';

test('classifies my work, handoffs and completed work without including unrelated tasks', () => {
  assert.equal(taskBucket({ status: 'TODO', assignee: { id: 'me' } }, 'me'), 'todo');
  assert.equal(taskBucket({ status: 'PENDING_REVIEW', assignee: { id: 'other' }, handedOffById: 'me' }, 'me'), 'waiting');
  assert.equal(taskBucket({ status: 'TODO', assignee: { id: 'other' }, createdById: 'me' }, 'me'), 'waiting');
  assert.equal(taskBucket({ status: 'DONE', assignee: { id: 'other' }, createdById: 'me' }, 'me'), 'done');
  assert.equal(taskBucket({ status: 'TODO', assignee: { id: 'other' } }, 'me'), null);
  assert.equal(taskBucket({ status: 'TODO' }, undefined), null);
});
