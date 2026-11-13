import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { routePattern, shouldShowFeedback } from './feedback-logic.ts';
test('route patterns hide ids but retain named pages', () => {
  assert.equal(
    routePattern('/cases/550e8400-e29b-41d4-a716-446655440000/documents'),
    '/cases/[id]/documents',
  );
  assert.equal(routePattern('/cases/123/documents'), '/cases/[id]/documents');
  assert.equal(routePattern('/cases/abc123/documents'), '/cases/abc123/documents');
  assert.equal(routePattern('/cases/0'), '/cases/[id]');
  assert.equal(routePattern('/cases/new'), '/cases/new');
  assert.equal(routePattern('/settings/notifications-preferences'), '/settings/notifications-preferences');
  assert.equal(routePattern('/cases/clh9wz4f10000qzrmn831i7rn'), '/cases/[id]');
});
test('visit, day, route and dialog gates', () => {
  const now = 100 * 86400000;
  assert.equal(shouldShowFeedback(2, null, null, now, 'today', false), false);
  assert.equal(shouldShowFeedback(3, null, null, now, 'today', false), true);
  assert.equal(shouldShowFeedback(3, now - 89 * 86400000, null, now, 'today', false), false);
  assert.equal(shouldShowFeedback(3, now - 90 * 86400000, null, now, 'today', false), true);
  assert.equal(shouldShowFeedback(4, null, 'yesterday', now, 'today', false), true);
  assert.equal(shouldShowFeedback(3, now - 90 * 86400000, 'today', now, 'today', false), false);
  assert.equal(shouldShowFeedback(3, null, null, now, 'today', true), false);
});
