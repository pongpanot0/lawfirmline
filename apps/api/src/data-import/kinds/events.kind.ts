import { AuthUser, COURT_EVENT_KIND_LABELS, CourtEventKind, EventType } from '@lawfirm/shared';
import { splitList } from '../../common/excel-import/reader';
import type { RawImportRow } from '../../common/excel-import/types';
import type { CreateEventDto } from '../../calendar/dto/calendar.dto';
import type { ImportDraft, ImportKindDef, ImportKindDeps } from '../import-kind';
import { checkDuplicate, draftFor, importDate, memberHelp, ownValue, requiredText, resolveCase, resolveMember, signature, staffCanImport, staffCases, StaffCaseLookups } from '../kind-helpers';

export const EVENT_HEADERS = ['เลขอ้างอิงคดี *', 'หัวข้อ *', 'ประเภท *', 'ประเภทนัดศาล', 'วันที่ *', 'เวลาเริ่ม', 'เวลาสิ้นสุด', 'ศาล/สถานที่', 'ผู้รับผิดชอบ (อีเมล คั่นด้วย ;)', 'รายละเอียด'] as const;
const TYPES: Record<string, EventType> = { 'นัดศาล': EventType.COURT_DATE, 'นัดพบลูกความ': EventType.CLIENT_MEETING, 'กำหนดส่ง': EventType.DEADLINE, 'อื่น ๆ': EventType.OTHER };
const COURT_KINDS = Object.fromEntries(Object.entries(COURT_EVENT_KIND_LABELS).map(([kind, label]) => [label, kind as CourtEventKind]));
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
export interface EventDraft extends ImportDraft { data: CreateEventDto }
/** Same event = title, case, event type, exact UTC start/end and sorted attending member IDs. */
export const eventSignature = (event: { title: string; caseId: string; type?: string; startAt: string; endAt?: string; assigneeIds?: string[] }) => signature(event.title, event.caseId, event.type, event.startAt, event.endAt, [...(event.assigneeIds ?? [])].sort().join(','));
export function resolveEventRows(rows: RawImportRow[], lookups: StaffCaseLookups, user: AuthUser): EventDraft[] {
  const seen = new Map<string, number>();
  return rows.map((row) => {
    const draft = draftFor(row, user);
    const legalCase = resolveCase(draft, lookups, EVENT_HEADERS[0], true);
    const title = requiredText(draft, EVENT_HEADERS[1]);
    const typeText = requiredText(draft, EVENT_HEADERS[2]);
    const type = ownValue(TYPES, typeText);
    if (typeText && !type) draft.problems.push(`ประเภท *: ไม่ถูกต้อง ${typeText}`);
    const kindText = draft.cells['ประเภทนัดศาล'];
    const courtEventKind = kindText ? ownValue(COURT_KINDS, kindText) : undefined;
    if (kindText && type !== EventType.COURT_DATE) draft.problems.push(`ประเภทนัดศาล: ใช้ได้เฉพาะนัดศาล (${kindText})`);
    else if (kindText && !courtEventKind) draft.problems.push(`ประเภทนัดศาล: ไม่ถูกต้อง ${kindText}`);
    const date = importDate(draft, row, 'วันที่ *', true);
    const startTime = draft.cells['เวลาเริ่ม'] || '09:00';
    const endTime = draft.cells['เวลาสิ้นสุด'];
    if (!TIME.test(startTime)) draft.problems.push(`เวลาเริ่ม: ต้องเป็น HH:mm แบบ 24 ชั่วโมง (${startTime})`);
    if (endTime && !TIME.test(endTime)) draft.problems.push(`เวลาสิ้นสุด: ต้องเป็น HH:mm แบบ 24 ชั่วโมง (${endTime})`);
    if (endTime && TIME.test(startTime) && TIME.test(endTime) && endTime <= startTime) draft.problems.push(`เวลาสิ้นสุด: ${endTime} ต้องหลังเวลาเริ่ม ${startTime} ในวันเดียวกัน`);
    const header = 'ผู้รับผิดชอบ (อีเมล คั่นด้วย ;)';
    const emails = splitList(row.values[header]);
    const assigneeIds: string[] = [];
    const displays: string[] = [];
    for (const email of emails) {
      draft.cells[header] = email;
      const member = resolveMember(draft, lookups, header);
      if (member && !assigneeIds.includes(member.id)) { assigneeIds.push(member.id); displays.push(draft.cells[header]); }
      else if (member) draft.problems.push(`${header}: อีเมลซ้ำ ${email}`);
    }
    draft.cells[header] = displays.length ? displays.join('; ') : emails.join('; ');
    if (assigneeIds.length > 10) draft.problems.push(`${header}: ผู้รับผิดชอบเกิน 10 คน`);
    const instant = (time: string) => date && TIME.test(time) ? new Date(`${date.toISOString().slice(0, 10)}T${time}:00+07:00`).toISOString() : '';
    const data: CreateEventDto = { caseId: legalCase?.id ?? '', title, type, courtEventKind, startAt: instant(startTime), endAt: endTime ? instant(endTime) || undefined : undefined, courtName: draft.cells['ศาล/สถานที่'] || undefined, description: draft.cells['รายละเอียด'] || undefined, assigneeIds: assigneeIds.length ? assigneeIds : undefined };
    const result = { ...draft, data };
    if (title && data.caseId && data.startAt) checkDuplicate(result, eventSignature(data), lookups.existing, seen, EVENT_HEADERS[1]);
    return result;
  });
}
export function eventsKind(deps: ImportKindDeps): ImportKindDef<EventDraft, StaffCaseLookups> {
  return {
    kind: 'events', label: 'นัดหมาย/นัดศาล', sheet: 'นัดหมาย-นัดศาล', headers: EVENT_HEADERS, required: [EVENT_HEADERS[0], EVENT_HEADERS[1], EVENT_HEADERS[2], 'วันที่ *'], canImport: staffCanImport,
    help: {
      'เลขอ้างอิงคดี *': 'เลขอ้างอิงภายในคดีที่คุณเข้าถึงได้', 'หัวข้อ *': 'หัวข้อนัดหมาย', 'ประเภท *': 'นัดศาล/นัดพบลูกความ/กำหนดส่ง/อื่น ๆ',
      'ประเภทนัดศาล': 'เลือกจากรายการ เฉพาะประเภทนัดศาล', 'วันที่ *': 'วว/ดด/ปปปป (พ.ศ. หรือ ค.ศ.)', 'เวลาเริ่ม': 'HH:mm แบบ 24 ชั่วโมง เวลาไทย เว้นว่าง = 09:00',
      'เวลาสิ้นสุด': 'HH:mm เวลาไทย ต้องหลังเวลาเริ่มในวันเดียวกัน เว้นว่างได้', 'ศาล/สถานที่': 'เว้นว่าง = ใช้ศาลของคดี',
      'ผู้รับผิดชอบ (อีเมล คั่นด้วย ;)': 'อีเมลสมาชิกไม่เกิน 10 คน คั่นด้วย ; เว้นว่าง = ไม่ระบุผู้รับผิดชอบ (การแจ้งเตือนใช้ทนายหลักของคดี)', 'รายละเอียด': 'รายละเอียดนัดหมาย; รายการซ้ำตรวจหัวข้อ คดี ประเภท เวลาและผู้รับผิดชอบ',
    },
    template: (lookups, user) => ({ dropdowns: [['ประเภท *', Object.keys(TYPES)], ['ประเภทนัดศาล', Object.keys(COURT_KINDS)]], dateHeaders: ['วันที่ *', 'เวลาเริ่ม', 'เวลาสิ้นสุด'], examples: [[lookups.cases[0]?.ownRef ?? 'REF20260001', 'นัดสืบพยาน', 'นัดศาล', Object.keys(COURT_KINDS)[0], '15/12/2569', '09:00', '12:00', '', user.email, 'เตรียมเอกสาร']], extraHelp: memberHelp(lookups.members) }),
    async lookups(db, user) {
      const refs = await staffCases(db, user, deps);
      const events = await db.calendarEvent.findMany({ where: { caseId: { in: refs.cases.map((item) => item.id) }, case: { firmId: user.firmId } }, select: { title: true, caseId: true, type: true, startAt: true, endAt: true, assigneeId: true, assignees: { select: { userId: true } } } });
      return { ...refs, existing: new Set(events.map((event) => eventSignature({ ...event, startAt: event.startAt.toISOString(), endAt: event.endAt?.toISOString(), assigneeIds: event.assignees.length ? event.assignees.map((item) => item.userId) : event.assigneeId ? [event.assigneeId] : undefined }))) };
    },
    resolve: resolveEventRows,
    async commit(tx, _user, drafts) {
      const future: string[] = [];
      for (const draft of drafts) {
        const event = await deps.calendar.createInternal(draft.data, undefined, tx);
        if (event.startAt > new Date()) future.push(event.id);
      }
      return { created: drafts.length, after: async () => {
        const failures: unknown[] = [];
        for (const id of future) {
          try { deps.outlookCalendar.syncEventSoon(id); } catch (error) { failures.push(error); }
        }
        if (failures.length) throw new Error(`ไม่สามารถตั้งคิวซิงก์ Outlook ได้ ${failures.length} นัดหมาย`);
      } };
    },
  };
}
