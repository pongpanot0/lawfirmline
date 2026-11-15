import { test } from 'node:test';
import assert from 'node:assert/strict';
import { move, insertAt, setColumn, toggleHidden } from './template-layout-ops.ts';
import type { TemplateLayout } from '@lawfirm/shared';
const layout: TemplateLayout = { version: 1, blocks: [{ id: 'a', type: 'firm', column: 'full' }, { id: 'b', type: 'note', column: 'left' }] };
test('move and insert preserve order and source', () => { assert.deepEqual(move(layout, 0, 1).blocks.map(b => b.id), ['b', 'a']); assert.deepEqual(insertAt(layout, { id: 'c', type: 'bank', column: 'full' }, 1).blocks.map(b => b.id), ['a', 'c', 'b']); assert.equal(layout.blocks.length, 2); });
test('column and visibility respect VAT locks', () => { assert.equal(setColumn(layout, 'b', 'right').blocks[1].column, 'right'); assert.equal(toggleHidden(layout, 'a', true).blocks[0].hidden, undefined); assert.equal(toggleHidden(layout, 'a', false).blocks[0].hidden, true); });
