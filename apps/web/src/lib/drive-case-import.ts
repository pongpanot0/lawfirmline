import { CASE_NUMBER_REGEX } from '@lawfirm/shared';
import type { ImportCaseRow, ParsedCaseFolder } from './api';

/** One editable row of "สร้างคดีใหม่จาก folder". Everything but the folder is a suggestion the importer can change. */
export interface ImportCaseDraft extends ImportCaseRow {
  selected: boolean;
  folderName: string;
  caseNumberRaw: string | null;
  teamHint: string | null;
}

// Numbered folders ("89. คำให้การ …") are case folders; templates and group folders ("B. …") are not.
const NUMBERED = /^\d+\./;

export function draftFromSuggestion(row: {
  folder: { id: string; name: string };
  parsed: ParsedCaseFolder;
  suggestions: unknown[];
}): ImportCaseDraft {
  const { folder, parsed } = row;
  return {
    selected: NUMBERED.test(folder.name.trim()) && row.suggestions.length === 0,
    folderName: folder.name,
    caseNumberRaw: parsed.caseNumberRaw,
    teamHint: parsed.teamHint,
    itemId: folder.id,
    title: parsed.title,
    blackCaseNumber: parsed.blackCaseNumber ?? '',
    courtName: parsed.courtName ?? '',
    courtLevel: parsed.courtLevel,
    leadLawyerId: '',
    buddyIds: [],
    closed: parsed.closed,
    outcome: parsed.outcome ?? undefined,
    closingSummary: `นำเข้าจาก OneDrive: ${folder.name}`,
  };
}

/** Same rules the API enforces, said in Thai before the request goes out. */
export function draftProblem(d: ImportCaseDraft): string | null {
  if (!d.leadLawyerId) return 'ยังไม่ได้เลือกทนายหลัก';
  if (!d.title.trim()) return 'ชื่อคดีว่าง';
  if (d.blackCaseNumber?.trim() && !CASE_NUMBER_REGEX.test(d.blackCaseNumber.trim())) return 'เลขคดีไม่ถูกรูปแบบ';
  if (d.closed && !d.outcome) return 'เลือกผลคดี';
  if (d.closed && (d.closingSummary ?? '').trim().length < 10) return 'สรุปตอนปิดต้องยาวอย่างน้อย 10 ตัวอักษร';
  return null;
}

/** The request body for one draft: blank optionals dropped, closed-only fields only when closed. */
export function toImportRow(d: ImportCaseDraft): ImportCaseRow {
  return {
    itemId: d.itemId,
    title: d.title.trim(),
    blackCaseNumber: d.blackCaseNumber?.trim() || undefined,
    courtName: d.courtName?.trim() || undefined,
    courtLevel: d.courtLevel,
    leadLawyerId: d.leadLawyerId,
    buddyIds: d.buddyIds?.filter((id) => id !== d.leadLawyerId),
    closed: d.closed,
    outcome: d.closed ? d.outcome : undefined,
    closingSummary: d.closed ? d.closingSummary?.trim() : undefined,
  };
}
