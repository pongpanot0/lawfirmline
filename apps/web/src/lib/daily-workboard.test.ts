import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TaskWorkType } from '@lawfirm/shared';
import { assignmentCandidates, needsOwner, updatedOn } from './daily-workboard.ts';

test('freshness follows Bangkok day and the current worker, never a previous assignee', () => {
  const task = { workerId: 'worker', status: 'TODO', scheduledFor: '2026-09-27', latestUpdate: { authorId: 'worker', createdAt: '2026-09-26T18:00:00Z' } } as any;
  assert.equal(updatedOn(task, '2026-09-27'), true);
  assert.equal(updatedOn(task, '2026-09-26'), false);
  assert.equal(updatedOn({ ...task, workerId: 'replacement' }, '2026-09-27'), false);
  assert.equal(needsOwner({ ...task, latestUpdate: null }, '2026-09-27'), true);
  assert.equal(needsOwner({ ...task, workerId: null, latestUpdate: null }, '2026-09-27'), false);
  assert.equal(needsOwner({ ...task, blocker: 'ขาดเอกสาร' }, '2026-09-27'), true);
  assert.equal(needsOwner({ ...task, status: 'DONE', blocker: 'ขาดเอกสาร' }, '2026-09-27'), false);
});

test('recommendations disclose unknown progress and review work instead of implying availability', () => {
  const members = [
    { userId: 'absent', workTypes: [TaskWorkType.TRANSCRIPTION], onLeave: true },
    { userId: 'worker', workTypes: [TaskWorkType.TRANSCRIPTION], onLeave: false },
    { userId: 'unconfigured', workTypes: [], onLeave: false },
  ] as any;
  const tasks = [{ workerId: 'worker', status: 'TODO', latestUpdate: null }, { workerId: 'unconfigured', assigneeId: 'worker', status: 'PENDING_REVIEW' }] as any;
  const result = assignmentCandidates(members, tasks, TaskWorkType.TRANSCRIPTION, '2026-09-27');
  assert.equal(result[0].member.userId, 'worker');
  assert.equal(result[0].unknown, true);
  assert.equal(result[0].reviews.length, 1);
  assert.equal(result.at(-1)!.member.userId, 'absent');
  assert.equal(result[1].configured, false);
});

test('candidates rank by sized load, so one large job outweighs two small ones', () => {
  const members = [
    { userId: 'big', workTypes: [TaskWorkType.GENERAL], onLeave: false },
    { userId: 'small', workTypes: [TaskWorkType.GENERAL], onLeave: false },
  ] as any;
  const fresh = { authorId: '', createdAt: '2026-09-27T03:00:00Z' };
  const tasks = [
    { workerId: 'big', status: 'TODO', size: 'L', latestUpdate: { ...fresh, authorId: 'big' } },
    { workerId: 'small', status: 'TODO', size: 'S', latestUpdate: { ...fresh, authorId: 'small' } },
    { workerId: 'small', status: 'TODO', size: 'M', latestUpdate: { ...fresh, authorId: 'small' } },
  ] as any;
  const result = assignmentCandidates(members, tasks, TaskWorkType.GENERAL, '2026-09-27');
  assert.deepEqual(result.map((c) => [c.member.userId, c.points]), [['small', 3], ['big', 4]]);
});
