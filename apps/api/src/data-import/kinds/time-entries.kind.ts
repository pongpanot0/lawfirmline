import { AuthUser, HOURS_MAX, MONEY_MAX, hasFirmCapability } from '@lawfirm/shared';
import type { RawImportRow } from '../../common/excel-import/types';
import type { ImportDraft, ImportKindDef, ImportKindDeps } from '../import-kind';
import { checkDuplicate, dayKey, draftFor, importAmount, importDate, maxLength, memberHelp, resolveCase, resolveMember, signature, staffCanImport, staffCases, StaffCaseLookups, yesNo } from '../kind-helpers';

export const TIME_HEADERS = ['วันที่ *', 'เลขอ้างอิงคดี *', 'ชั่วโมง *', 'ผู้ทำงาน (อีเมล; ว่าง = ผู้นำเข้า)', 'อัตรา (บาท/ชม.; ว่าง = อัตราตั้งต้นของสมาชิก)', 'รายละเอียด', 'เรียกเก็บได้'] as const;
export interface TimeEntryDraft extends ImportDraft { date?: Date; caseId: string; hours?: number; userId: string; rate: number; description?: string; billable: boolean }
/** Same time = day, accessible case, worker, hours, hourly rate and description. */
export const timeEntrySignature = (entry: Pick<TimeEntryDraft, 'date' | 'caseId' | 'userId' | 'hours' | 'rate' | 'description'>) => signature(dayKey(entry.date), entry.caseId, entry.userId, entry.hours, entry.rate, entry.description);
export function resolveTimeEntryRows(rows: RawImportRow[], lookups: StaffCaseLookups, user: AuthUser): TimeEntryDraft[] {
  const seen = new Map<string, number>();
  return rows.map((row) => {
    const draft = draftFor(row, user);
    const date = importDate(draft, row, TIME_HEADERS[0], true);
    const legalCase = resolveCase(draft, lookups, TIME_HEADERS[1], true);
    const value = draft.cells[TIME_HEADERS[2]] ?? '';
    const hours = typeof row.values[TIME_HEADERS[2]] === 'number' || /^(?:\d+(?:\.\d+)?|\.\d+)$/.test(value) ? Number(value) : undefined;
    if (!value) draft.problems.push(`ยังไม่ได้กรอก ${TIME_HEADERS[2]}`);
    else if (hours === undefined || !Number.isFinite(hours) || hours <= 0 || hours > HOURS_MAX) draft.problems.push(`${TIME_HEADERS[2]}: ${value} ต้องมากกว่า 0 และไม่เกิน 24 ชั่วโมง`);
    const member = resolveMember(draft, lookups, TIME_HEADERS[3], user.id);
    if (member && member.id !== user.id && !hasFirmCapability(user.firmRole, 'manageInvoices')) draft.problems.push(`${TIME_HEADERS[3]}: ไม่มีสิทธิ์ระบุผู้ทำงานคนอื่น (${member.email})`);
    const rate = importAmount(draft, row, TIME_HEADERS[4]) ?? member?.defaultHourlyRate ?? 0;
    if (!Number.isFinite(rate) || rate < 0 || rate > MONEY_MAX) draft.problems.push(`${TIME_HEADERS[4]}: ${rate} ต้องอยู่ระหว่าง 0 ถึง ${MONEY_MAX}`);
    maxLength(draft, 'รายละเอียด', 500);
    const result: TimeEntryDraft = { ...draft, date, caseId: legalCase?.id ?? '', hours, userId: member?.id ?? '', rate, description: draft.cells['รายละเอียด'] || undefined, billable: yesNo(draft, 'เรียกเก็บได้') };
    if (date && legalCase && member && hours !== undefined) checkDuplicate(result, timeEntrySignature(result), lookups.existing, seen, TIME_HEADERS[2]);
    return result;
  });
}
export function timeEntriesKind(deps: ImportKindDeps): ImportKindDef<TimeEntryDraft, StaffCaseLookups> {
  return {
    kind: 'time-entries', label: 'บันทึกเวลา', sheet: 'บันทึกเวลา', headers: TIME_HEADERS, required: [...TIME_HEADERS.slice(0, 3)], canImport: staffCanImport,
    help: {
      'วันที่ *': 'วว/ดด/ปปปป (พ.ศ. หรือ ค.ศ.)', 'เลขอ้างอิงคดี *': 'เลขอ้างอิงภายในคดีที่คุณเข้าถึงได้', 'ชั่วโมง *': 'มากกว่า 0 ไม่เกิน 24 ชั่วโมง',
      'ผู้ทำงาน (อีเมล; ว่าง = ผู้นำเข้า)': 'เว้นว่าง = ผู้นำเข้า ผู้จัดการการเงินระบุสมาชิกคนอื่นได้',
      'อัตรา (บาท/ชม.; ว่าง = อัตราตั้งต้นของสมาชิก)': `ตัวเลข 0–${MONEY_MAX} บาท/ชั่วโมง เว้นว่าง = อัตราสมาชิก ถ้าไม่ตั้งไว้ใช้ 0`,
      'รายละเอียด': 'ไม่เกิน 500 ตัวอักษร; รายการซ้ำตรวจวันที่ คดี ผู้ทำงาน ชั่วโมง อัตราและรายละเอียด', 'เรียกเก็บได้': 'ใช่/ไม่ เว้นว่าง = ใช่',
    },
    template: (lookups) => ({ dropdowns: [['เรียกเก็บได้', ['ใช่', 'ไม่']]], dateHeaders: ['วันที่ *'], examples: [['15/12/2569', lookups.cases[0]?.ownRef ?? 'REF20260001', 1.5, '', '', 'เตรียมคำให้การ', 'ใช่']], extraHelp: memberHelp(lookups.members) }),
    async lookups(db, user) {
      const refs = await staffCases(db, user, deps);
      const entries = await db.timeEntry.findMany({ where: { caseId: { in: refs.cases.map((item) => item.id) }, case: { firmId: user.firmId }, userId: { in: hasFirmCapability(user.firmRole, 'manageInvoices') ? refs.members.map((member) => member.id) : [user.id] } }, select: { date: true, caseId: true, userId: true, hours: true, rate: true, description: true } });
      return { ...refs, existing: new Set(entries.map((entry) => timeEntrySignature({ ...entry, description: entry.description ?? undefined }))) };
    },
    resolve: resolveTimeEntryRows,
    async commit(tx, _user, drafts) {
      for (const draft of drafts) await tx.timeEntry.create({ data: { date: draft.date!, caseId: draft.caseId, userId: draft.userId, hours: draft.hours!, rate: draft.rate, description: draft.description, billable: draft.billable } });
      return { created: drafts.length };
    },
  };
}
