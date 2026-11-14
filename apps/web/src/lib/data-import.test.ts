import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ImportRow } from './api.ts';
import { checkImportFile, filterImportRows, importCounts, mergeImportProblems } from './data-import.ts';

const rows: ImportRow[] = [{ rowNumber: 2, problems: [], cells: { name: 'ก' } }, { rowNumber: 3, problems: ['เดิม'], cells: {} }];
test('filters and counts rows', () => {
  assert.deepEqual(importCounts(rows), { ready: 1, problems: 1 });
  assert.deepEqual(filterImportRows(rows, true), [rows[1]]);
  assert.deepEqual(filterImportRows(rows, false), rows);
});
test('merges conflict problems without losing existing problems or cells', () => {
  const merged = mergeImportProblems(rows, [{ rowNumber: 2, problems: ['ใหม่'] }, { rowNumber: 3, problems: ['เดิม', 'ใหม่'] }]);
  assert.deepEqual(merged[0], { ...rows[0], problems: ['ใหม่'] });
  assert.deepEqual(merged[1].problems, ['เดิม', 'ใหม่']);
  assert.deepEqual(importCounts(merged), { ready: 0, problems: 2 });
});
test('checks file extension and size', () => {
  assert.ok(checkImportFile({ name: 'a.xls', size: 1 }));
  assert.ok(checkImportFile({ name: 'a.xlsx', size: 2 * 1024 * 1024 + 1 }));
  assert.equal(checkImportFile({ name: 'a.XLSX', size: 2 * 1024 * 1024 }), '');
});
