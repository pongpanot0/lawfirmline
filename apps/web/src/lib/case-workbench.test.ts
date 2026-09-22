import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildCasePrioritySummary } from './case-workbench.ts';

describe('buildCasePrioritySummary', () => {
  it('keeps missing dates neutral instead of inventing urgency', () => {
    const summary = buildCasePrioritySummary(
      {
        tasks: [
          { id: 'task-done', status: 'DONE', dueDate: null },
          { id: 'task-open', status: 'TODO', dueDate: null },
        ],
        requiredDocuments: [],
        upcomingEvents: [],
        limitationDeadline: null,
      },
      new Date('2026-09-22T00:00:00.000Z'),
    );

    assert.equal(summary.pendingTaskCount, 1);
    assert.equal(summary.completedTaskCount, 1);
    assert.equal(summary.nextPendingTask?.id, 'task-open');
    assert.equal(summary.nextEvent, null);
    assert.equal(summary.limitationDays, null);
  });

  it('reports existing document progress and clamps an expired limitation date to zero', () => {
    const summary = buildCasePrioritySummary(
      {
        tasks: [],
        requiredDocuments: [
          { category: 'ID_CARD', present: true },
          { category: 'POWER_OF_ATTORNEY', present: false },
        ],
        upcomingEvents: [{ id: 'event-1', startAt: '2026-09-25T03:00:00.000Z' }],
        limitationDeadline: '2026-09-20T00:00:00.000Z',
      },
      new Date('2026-09-22T00:00:00.000Z'),
    );

    assert.equal(summary.presentRequiredDocumentCount, 1);
    assert.equal(summary.requiredDocumentCount, 2);
    assert.equal(summary.missingRequiredDocumentCount, 1);
    assert.equal(summary.nextEvent?.id, 'event-1');
    assert.equal(summary.limitationDays, 0);
  });

  it('does not mutate or reorder task and event inputs', () => {
    const tasks = [
      { id: 'task-b', status: 'TODO', dueDate: '2026-10-02' },
      { id: 'task-a', status: 'IN_PROGRESS', dueDate: '2026-09-30' },
    ];
    const events = [
      { id: 'event-b', startAt: '2026-10-02T03:00:00.000Z' },
      { id: 'event-a', startAt: '2026-09-30T03:00:00.000Z' },
    ];

    const taskOrder = tasks.map((task) => task.id);
    const eventOrder = events.map((event) => event.id);

    buildCasePrioritySummary(
      {
        tasks,
        requiredDocuments: [],
        upcomingEvents: events,
        limitationDeadline: null,
      },
      new Date('2026-09-22T00:00:00.000Z'),
    );

    assert.deepEqual(tasks.map((task) => task.id), taskOrder);
    assert.deepEqual(events.map((event) => event.id), eventOrder);
  });
});
