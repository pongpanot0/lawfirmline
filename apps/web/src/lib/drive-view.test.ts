import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatFileSize, isOfficeEditable, officeAppName, officeEditedHint } from './drive-view.ts';

test('only docx/xlsx/pptx are Office-editable', () => {
  assert.equal(isOfficeEditable('สัญญา.DOCX'), true);
  assert.equal(isOfficeEditable('งบ.xlsx'), true);
  assert.equal(isOfficeEditable('slides.pptx'), true);
  assert.equal(isOfficeEditable('old.doc'), false);
  assert.equal(isOfficeEditable('scan.pdf'), false);
});

test('names the Office app from the extension', () => {
  assert.equal(officeAppName('a.docx'), 'Word');
  assert.equal(officeAppName('a.xlsx'), 'Excel');
  assert.equal(officeAppName('a.pptx'), 'PowerPoint');
});

test('formats sizes', () => {
  assert.equal(formatFileSize(null), '');
  assert.equal(formatFileSize(512), '512 B');
  assert.equal(formatFileSize(2048), '2.0 KB');
  assert.equal(formatFileSize(5 * 1024 * 1024), '5.0 MB');
});

test('hint only when Office has unpulled edits, in Bangkok time', () => {
  assert.equal(officeEditedHint('a.docx', undefined), null);
  assert.equal(officeEditedHint('a.docx', { lastModifiedDateTime: '2026-10-13T08:30:00Z', hasNewerEdits: false }), null);
  const hint = officeEditedHint('a.xlsx', { lastModifiedDateTime: '2026-10-13T08:30:00Z', hasNewerEdits: true });
  assert.match(hint ?? '', /^แก้ใน Excel ล่าสุด .*15:30.*ยังไม่ได้ดึงกลับ$/);
});
