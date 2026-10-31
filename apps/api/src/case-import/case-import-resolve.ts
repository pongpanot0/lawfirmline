import { CASE_NUMBER_REGEX, CaseOutcome, CaseStage, CourtLevel, PartyRole } from '@lawfirm/shared';
import {
  COURT_LEVEL_BY_LABEL,
  OUTCOME_BY_LABEL,
  PARTY_ROLE_BY_LABEL,
  STAGE_BY_LABEL,
  STATUS_LABELS,
} from './case-import-columns';
import { parseAmount, parseImportDate, splitList, type CellValue, type RawCaseRow } from './case-import-reader';

/** Everything a row may point at, loaded for the caller's firm only. Keys are lowercased/trimmed. */
export interface ImportLookups {
  lawyersByEmail: Map<string, string>;
  membersByEmail: Map<string, string>;
  clientsByName: Map<string, string>;
  caseTypesByName: Map<string, string>;
  existingOwnRefs: Set<string>;
  /** Black numbers of the firm's cases and of their proceedings. */
  existingNumbers: { number: string; court: string | null; ownRef: string }[];
}

/** One sheet row after checking: the create payload plus what the review table shows. */
export interface ExcelCaseDraft {
  rowNumber: number;
  problems: string[];
  title: string;
  leadEmail: string;
  leadLawyerId: string;
  buddyIds: string[];
  courtLevel: CourtLevel;
  ownRef?: string;
  customerRef?: string;
  clientId?: string;
  clientName?: string;
  clientMatched: boolean;
  partyRole?: PartyRole;
  opponents: string[];
  caseTypeId?: string;
  courtName?: string;
  blackCaseNumber?: string;
  redCaseNumber?: string;
  claimedAmount?: number;
  estimatedFee?: number;
  /** YYYY-MM-DD */
  limitationDeadline?: string;
  stage?: CaseStage;
  openedAt?: string;
  closed: boolean;
  outcome?: CaseOutcome;
  closedAt?: string;
  closingSummary?: string;
  description?: string;
}

const text = (v: CellValue | undefined) => (v === undefined ? '' : v instanceof Date ? v.toISOString() : String(v).trim());
const key = (v: string) => v.trim().toLowerCase();
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const norm = (court: string | undefined | null) => (court ? key(court) : null);

export function resolveCaseRows(rows: RawCaseRow[], lookups: ImportLookups, today: Date): ExcelCaseDraft[] {
  const seenRefs = new Map<string, number>();
  const seenNumbers: { number: string; court: string | null; rowNumber: number }[] = [];
  return rows.map((row) => {
    const draft = resolveRow(row, lookups, today);
    const duplicate = findDuplicate(draft, lookups, seenRefs, seenNumbers);
    if (duplicate) draft.problems.push(duplicate);
    if (draft.ownRef) seenRefs.set(draft.ownRef, row.rowNumber);
    if (draft.blackCaseNumber) seenNumbers.push({ number: draft.blackCaseNumber, court: norm(draft.courtName), rowNumber: row.rowNumber });
    return draft;
  });
}

/** Same black number + court (a missing court matches any), or the same own ref — in the firm or earlier in the file. */
function findDuplicate(
  d: ExcelCaseDraft,
  lookups: ImportLookups,
  seenRefs: Map<string, number>,
  seenNumbers: { number: string; court: string | null; rowNumber: number }[],
): string | null {
  if (d.ownRef && lookups.existingOwnRefs.has(d.ownRef)) return `มีคดีนี้ในระบบแล้ว (${d.ownRef})`;
  const court = norm(d.courtName);
  const sameCourt = (other: string | null) => !court || !other || other === court;
  if (d.blackCaseNumber) {
    const hit = lookups.existingNumbers.find((n) => n.number === d.blackCaseNumber && sameCourt(norm(n.court)));
    if (hit) return `มีคดีนี้ในระบบแล้ว (${hit.ownRef})`;
  }
  const earlier =
    (d.ownRef && seenRefs.get(d.ownRef)) ||
    (d.blackCaseNumber && seenNumbers.find((n) => n.number === d.blackCaseNumber && sameCourt(n.court))?.rowNumber);
  return earlier ? `ซ้ำกับแถวที่ ${earlier} ในไฟล์` : null;
}

function resolveRow({ rowNumber, values: v }: RawCaseRow, lookups: ImportLookups, today: Date): ExcelCaseDraft {
  const problems: string[] = [];
  const optional = (s: string) => s || undefined;

  const title = text(v['ชื่อคดี *']);
  if (!title) problems.push('ยังไม่ได้กรอกชื่อคดี');

  const leadEmail = text(v['ทนายหลัก (อีเมล) *']);
  const leadLawyerId = lookups.lawyersByEmail.get(key(leadEmail)) ?? '';
  if (!leadEmail) problems.push('ยังไม่ได้กรอกอีเมลทนายหลัก');
  else if (!leadLawyerId) problems.push(`ไม่พบทนายอีเมล ${leadEmail} ในสำนักงาน`);

  const levelLabel = text(v['ชั้นศาล *']);
  const courtLevel = COURT_LEVEL_BY_LABEL[levelLabel];
  if (!courtLevel) problems.push(`ชั้นศาลไม่ถูกต้อง: ${levelLabel}`);

  const buddyIds: string[] = [];
  for (const email of splitList(v['ทีม (อีเมล คั่นด้วย ;)'])) {
    const id = lookups.membersByEmail.get(key(email));
    if (!id) problems.push(`ไม่พบสมาชิกอีเมล ${email} ในสำนักงาน`);
    else if (id !== leadLawyerId && !buddyIds.includes(id)) buddyIds.push(id);
  }

  const clientText = text(v['ลูกความ']);
  const clientId = clientText ? lookups.clientsByName.get(key(clientText)) : undefined;

  const roleLabel = text(v['ฐานะลูกความ']);
  const partyRole = roleLabel ? PARTY_ROLE_BY_LABEL[roleLabel] : undefined;
  if (roleLabel && !partyRole) problems.push(`ฐานะลูกความไม่ถูกต้อง: ${roleLabel}`);

  const typeLabel = text(v['ประเภทคดี']);
  const caseTypeId = typeLabel ? lookups.caseTypesByName.get(key(typeLabel)) : undefined;
  if (typeLabel && !caseTypeId) problems.push(`ไม่พบประเภทคดี ${typeLabel}`);

  const blackCaseNumber = optional(text(v['เลขคดีดำ']));
  if (blackCaseNumber && !CASE_NUMBER_REGEX.test(blackCaseNumber)) problems.push('เลขคดีดำไม่ถูกรูปแบบ');
  const redCaseNumber = optional(text(v['เลขคดีแดง']));
  if (redCaseNumber && !CASE_NUMBER_REGEX.test(redCaseNumber)) problems.push('เลขคดีแดงไม่ถูกรูปแบบ');

  const claimed = parseAmount(v['ทุนทรัพย์ (บาท)']);
  if (claimed === 'INVALID') problems.push('ทุนทรัพย์ไม่ถูกต้อง');
  const fee = parseAmount(v['ค่าวิชาชีพประมาณการ (บาท)']);
  if (fee === 'INVALID') problems.push('ค่าวิชาชีพไม่ถูกต้อง');

  const limitation = parseImportDate(v['วันครบอายุความ']);
  if (limitation === 'INVALID') problems.push('วันครบอายุความไม่ถูกต้อง');

  const opened = parseImportDate(v['วันเปิดคดี']);
  if (opened === 'INVALID') problems.push('วันเปิดคดีไม่ถูกต้อง');
  else if (opened && opened > today) problems.push('วันเปิดคดีอยู่ในอนาคต');

  const statusLabel = text(v['สถานะ']);
  if (statusLabel && statusLabel !== STATUS_LABELS.open && statusLabel !== STATUS_LABELS.closed) {
    problems.push(`สถานะไม่ถูกต้อง: ${statusLabel}`);
  }
  const closed = statusLabel === STATUS_LABELS.closed;

  const stageLabel = text(v['ขั้นตอนคดี']);
  const stage = stageLabel ? STAGE_BY_LABEL[stageLabel] : undefined;
  if (!closed && stageLabel && !stage) problems.push(`ขั้นตอนคดีไม่ถูกต้อง: ${stageLabel}`);

  let outcome: CaseOutcome | undefined;
  let closedAt: string | undefined;
  let closingSummary: string | undefined;
  if (closed) {
    const outcomeLabel = text(v['ผลคดี']);
    outcome = OUTCOME_BY_LABEL[outcomeLabel];
    if (!outcomeLabel) problems.push('เลือกผลคดีของคดีที่ปิดแล้ว');
    else if (!outcome) problems.push(`ผลคดีไม่ถูกต้อง: ${outcomeLabel}`);
    const closedDate = parseImportDate(v['วันปิดคดี']);
    if (closedDate === 'INVALID') problems.push('วันปิดคดีไม่ถูกต้อง');
    else if (closedDate && opened instanceof Date && closedDate < opened) problems.push('วันปิดคดีก่อนวันเปิดคดี');
    closedAt = closedDate instanceof Date ? isoDay(closedDate) : undefined;
    closingSummary = text(v['สรุปตอนปิด']) || `นำเข้าจาก Excel: ${title}`;
    if (closingSummary.length < 10) problems.push('สรุปตอนปิดต้องยาวอย่างน้อย 10 ตัวอักษร');
  }

  return {
    rowNumber,
    problems,
    title,
    leadEmail,
    leadLawyerId,
    buddyIds,
    courtLevel: courtLevel ?? CourtLevel.TRIAL,
    ownRef: optional(text(v['เลขอ้างอิงภายใน'])),
    customerRef: optional(text(v['เลขอ้างอิงลูกค้า'])),
    clientId,
    clientName: optional(clientText),
    clientMatched: !!clientId,
    partyRole,
    opponents: splitList(v['คู่ความฝ่ายตรงข้าม (คั่นด้วย ;)']),
    caseTypeId,
    courtName: optional(text(v['ศาล'])),
    blackCaseNumber,
    redCaseNumber,
    claimedAmount: typeof claimed === 'number' ? claimed : undefined,
    estimatedFee: typeof fee === 'number' ? fee : undefined,
    limitationDeadline: limitation instanceof Date ? isoDay(limitation) : undefined,
    stage: closed ? undefined : stage,
    openedAt: opened instanceof Date ? isoDay(opened) : undefined,
    closed,
    outcome,
    closedAt,
    closingSummary,
    description: optional(text(v['รายละเอียด'])),
  };
}
