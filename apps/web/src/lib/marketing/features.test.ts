import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pages, stages } from './features.ts';

test('feature content has unique routes and complete approved copy', () => {
  assert.equal(stages.length, 6);
  assert.equal(new Set(stages.map((stage) => stage.slug)).size, 6);
  for (const stage of stages) {
    const page = pages[stage.key];
    assert.ok(page && page.h1 && page.lead);
    assert.equal(page.details.length, 3);
    assert.ok(page.faq.length >= 2);
  }
  const copy = JSON.stringify({ pages, stages });
  for (const banned of ['ISO', 'ความปลอดภัยระดับธนาคาร', '15 นาที', 'อัตโนมัติ'])
    assert.ok(!copy.includes(banned), banned);
});
