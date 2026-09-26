import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AgendaItemKind } from '@lawfirm/shared';
import { isMineItem } from './agenda-item.ts';

test('an event is always mine, regardless of its assignee', () => {
  assert.equal(isMineItem({ kind: AgendaItemKind.COURT_DATE, assigneeId: 'other' }, 'viewer'), true);
  assert.equal(isMineItem({ kind: AgendaItemKind.CLIENT_MEETING, assigneeId: null }, 'viewer'), true);
});

test('a task assigned to someone else is not mine', () => {
  assert.equal(isMineItem({ kind: AgendaItemKind.TASK, assigneeId: 'other' }, 'viewer'), false);
});

test('an unassigned task is mine', () => {
  assert.equal(isMineItem({ kind: AgendaItemKind.TASK, assigneeId: null }, 'viewer'), true);
});
