import assert from 'node:assert/strict';
import { test } from 'node:test';
import { splitDraftParagraphs, splitParagraphSegments } from './pleading-draft-format.ts';

test('splits body text into paragraphs on blank lines, same as the server', () => {
  assert.deepEqual(splitDraftParagraphs('ย่อหน้าแรก [1]\n\nย่อหน้าสอง [2]'), ['ย่อหน้าแรก [1]', 'ย่อหน้าสอง [2]']);
});

test('splits a paragraph into text and citation segments', () => {
  assert.deepEqual(splitParagraphSegments('โจทก์เป็น [1] เจ้าของที่ดิน [2].'), [
    { type: 'text', value: 'โจทก์เป็น ' },
    { type: 'citation', n: 1 },
    { type: 'text', value: ' เจ้าของที่ดิน ' },
    { type: 'citation', n: 2 },
    { type: 'text', value: '.' },
  ]);
});

test('paragraph with no citation markers stays a single text segment', () => {
  assert.deepEqual(splitParagraphSegments('ไม่มีการอ้างอิง'), [{ type: 'text', value: 'ไม่มีการอ้างอิง' }]);
});
