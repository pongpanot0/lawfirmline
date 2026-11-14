import type { ImportRow } from './api';

export function filterImportRows(rows: ImportRow[], problemsOnly: boolean) {
  return problemsOnly ? rows.filter((row) => row.problems.length > 0) : rows;
}
export function importCounts(rows: ImportRow[]) {
  const problems = rows.filter((row) => row.problems.length > 0).length;
  return { problems, ready: rows.length - problems };
}
export function mergeImportProblems(rows: ImportRow[], updates: { rowNumber: number; problems: string[] }[]) {
  const byRow = new Map(updates.map((row) => [row.rowNumber, row.problems]));
  return rows.map((row) => ({ ...row, problems: [...new Set([...row.problems, ...(byRow.get(row.rowNumber) ?? [])])] }));
}
export function checkImportFile(file: { name: string; size: number }) {
  if (!file.name.toLowerCase().endsWith('.xlsx')) return 'กรุณาเลือกไฟล์ .xlsx';
  if (file.size > 2 * 1024 * 1024) return 'ไฟล์ต้องมีขนาดไม่เกิน 2 MB';
  return '';
}
