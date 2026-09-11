import test from 'node:test';
import assert from 'node:assert/strict';
import { taskUpdatePath, formatBytes } from './task-detail.ts';

test('taskUpdatePath routes personal tasks to /todos and case tasks to the case', () => {
  assert.equal(taskUpdatePath({ id: 't1', caseId: null }), '/todos/t1');
  assert.equal(taskUpdatePath({ id: 't1' }), '/todos/t1');
  assert.equal(taskUpdatePath({ id: 't1', caseId: 'c9' }), '/cases/c9/tasks/t1');
});

test('formatBytes picks a readable unit', () => {
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(2048), '2.0 KB');
  assert.equal(formatBytes(3 * 1024 * 1024), '3.0 MB');
});
