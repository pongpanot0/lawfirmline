import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseCaseTab, caseTabHref } from './case-tabs.ts';

describe('parseCaseTab', () => {
  it('defaults null/empty/unknown to overview', () => {
    assert.equal(parseCaseTab(null), 'overview');
    assert.equal(parseCaseTab(undefined), 'overview');
    assert.equal(parseCaseTab(''), 'overview');
    assert.equal(parseCaseTab('nope'), 'overview');
  });

  it('accepts each known tab id', () => {
    assert.equal(parseCaseTab('tasks'), 'tasks');
    assert.equal(parseCaseTab('closing-report'), 'closing-report');
  });
});

describe('caseTabHref', () => {
  it('uses bare path for overview', () => {
    assert.equal(caseTabHref('abc', 'overview'), '/cases/abc');
  });

  it('uses query for other tabs', () => {
    assert.equal(caseTabHref('abc', 'documents'), '/cases/abc?tab=documents');
  });
});
