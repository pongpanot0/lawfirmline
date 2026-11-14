import type { CellValue } from './reader';

export interface ImportSheetSpec {
  sheet: string;
  headers: readonly string[];
  required: readonly string[];
  maxRows: number;
  /** Preserve an existing reader's file-level wording. */
  rowLimitMessage?: string;
}

export interface RawImportRow {
  rowNumber: number;
  values: Record<string, CellValue>;
}

export interface TemplateExtras {
  dropdowns?: [string, string[]][];
  dateHeaders?: readonly string[];
  examples?: (string | number)[][];
  extraHelp?: { title: string; rows: (string | number)[][] }[];
}

export interface TemplateSpec extends ImportSheetSpec, TemplateExtras {
  help: Record<string, string>;
}
