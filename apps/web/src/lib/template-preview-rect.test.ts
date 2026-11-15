import { test } from 'node:test';
import assert from 'node:assert/strict';
import { overlayRect } from './template-preview-rect.ts';

test('maps iframe coordinates into the scaled overlay with offsets', () => {
  assert.deepEqual(overlayRect({ left: 20, top: 40, width: 200, height: 100 }, 0.5, { left: 3, top: 7 }), { left: 13, top: 27, width: 100, height: 50 });
});
