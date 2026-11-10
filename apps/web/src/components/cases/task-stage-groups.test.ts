import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { taskStageGroups } from './task-stage-groups.ts';

test('groups stage-labelled and unlabelled tasks with the current stage first', () => {
  const tasks = [{ labels: ['stage:FILING'] }, { labels: [] }, { labels: ['stage:HEARING'] }, { labels: ['stage:FILING'] }];
  const groups = taskStageGroups(tasks, 'HEARING');
  assert.deepEqual(groups.map(([stage, items]) => [stage, items.length]), [['HEARING', 1], ['FILING', 2], ['', 1]]);
});
