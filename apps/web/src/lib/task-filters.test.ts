import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyTaskFilters, EMPTY_TASK_FILTERS, collectTaskLabels } from './task-filters.ts';

const day = (offset: number) => {
  const d = new Date(2026, 8, 12, 12, 0, 0);
  d.setDate(d.getDate() + offset);
  return d.toISOString();
};
const now = new Date(2026, 8, 12, 9, 30);

const tasks = [
  { id: 'a', title: 'ร่างคำฟ้อง', status: 'TODO', priority: 'HIGH', labels: ['ศาล'], dueDate: day(-2), assignee: { id: 'u1' } },
  { id: 'b', title: 'โทรลูกความ', status: 'IN_PROGRESS', priority: 'LOW', labels: [], dueDate: day(0), assignee: null },
  { id: 'c', title: 'เตรียมพยาน', status: 'DONE', priority: 'MEDIUM', labels: ['ศาล', 'เอกสาร'], dueDate: day(5), assignee: { id: 'u2' } },
  { id: 'd', title: 'Review contract', status: 'TODO', priority: 'MEDIUM', labels: ['เอกสาร'], dueDate: null, assignee: { id: 'u1' } },
] as any[];

const ids = (f: Partial<typeof EMPTY_TASK_FILTERS>) =>
  applyTaskFilters(tasks, { ...EMPTY_TASK_FILTERS, ...f }, now).map((t) => t.id);

test('empty filters keep everything', () => {
  assert.deepEqual(ids({}), ['a', 'b', 'c', 'd']);
});

test('search matches the title case-insensitively', () => {
  assert.deepEqual(ids({ search: 'review' }), ['d']);
  assert.deepEqual(ids({ search: 'พยาน' }), ['c']);
});

test('status, priority, assignee and label narrow the list', () => {
  assert.deepEqual(ids({ status: 'TODO' }), ['a', 'd']);
  assert.deepEqual(ids({ priority: 'HIGH' }), ['a']);
  assert.deepEqual(ids({ assigneeId: 'u1' }), ['a', 'd']);
  assert.deepEqual(ids({ assigneeId: 'unassigned' }), ['b']);
  assert.deepEqual(ids({ label: 'เอกสาร' }), ['c', 'd']);
});

test('due filters: overdue excludes done, today, next 7 days, none', () => {
  assert.deepEqual(ids({ due: 'overdue' }), ['a']);
  assert.deepEqual(ids({ due: 'today' }), ['b']);
  assert.deepEqual(ids({ due: 'week' }), ['b', 'c']);
  assert.deepEqual(ids({ due: 'none' }), ['d']);
});

test('filters combine with AND', () => {
  assert.deepEqual(ids({ status: 'TODO', label: 'เอกสาร' }), ['d']);
});

test('collectTaskLabels returns unique labels sorted', () => {
  assert.deepEqual(collectTaskLabels(tasks), ['ศาล', 'เอกสาร']);
});
