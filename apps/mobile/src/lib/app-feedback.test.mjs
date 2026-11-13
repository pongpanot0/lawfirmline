import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { routePattern, patternFromSegments, shouldShowFeedback, isFeedbackEligible } from './app-feedback.ts';

test('patterns mask dynamic segments and web identifiers', () => {
  assert.equal(patternFromSegments(['case', '[id]'], '/case/private-slug'), '/case/[id]');
  assert.equal(routePattern('/cases/123'), '/cases/[id]');
  assert.equal(patternFromSegments(['(tabs)', 'index'], '/'), '/');
});

test('throttles from third visit per route and per day', () => {
  const now = 100 * 86400000;
  assert.equal(shouldShowFeedback(2, null, null, now, 'today', false), false);
  assert.equal(shouldShowFeedback(3, null, null, now, 'today', false), true);
  assert.equal(shouldShowFeedback(3, now - 89 * 86400000, null, now, 'today', false), false);
  assert.equal(shouldShowFeedback(3, now - 90 * 86400000, null, now, 'today', false), true);
  assert.equal(shouldShowFeedback(3, null, 'today', now, 'today', false), false);
  assert.equal(shouldShowFeedback(3, null, null, now, 'today', true), false);
});

test('excludes auth and form routes', () => {
  assert.equal(isFeedbackEligible(['(auth)', 'login'], '/login'), false);
  assert.equal(isFeedbackEligible(['case', 'new'], '/case/new'), false);
  assert.equal(isFeedbackEligible(['app-feedback'], '/app-feedback'), false);
  assert.equal(isFeedbackEligible(['case', '[id]'], '/case/123'), true);
});
