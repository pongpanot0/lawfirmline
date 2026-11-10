import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { matchGuideRoute, expandedForVisit, remainingText } from './guide-helpers.ts';

test('route matching prefers exact paths and matches one dynamic segment', () => {
  assert.equal(matchGuideRoute('/cases/new', ['/cases/:id', '/cases/new']), '/cases/new');
  assert.equal(matchGuideRoute('/cases/123', ['/cases/:id']), '/cases/:id');
  assert.equal(matchGuideRoute('/cases/123/tasks', ['/cases/:id']), undefined);
});
test('first three visits expand unless a preference exists', () => {
  assert.equal(expandedForVisit(1, null), true);
  assert.equal(expandedForVisit(3, null), true);
  assert.equal(expandedForVisit(4, null), false);
  assert.equal(expandedForVisit(1, 'collapsed'), false);
  assert.equal(expandedForVisit(8, 'expanded'), true);
});
test('remaining text names unfinished items', () => {
  assert.equal(remainingText([{label:'จำนวนเงิน',done:false},{label:'รายละเอียด',done:true}]), 'เหลืออีก 1 อย่าง: จำนวนเงิน');
  assert.equal(remainingText([{label:'จำนวนเงิน',done:true}]), '');
});
