import { thDate, timeAgo } from './format';
import { CASE_STAGE_LABELS_TH, CaseStage, CourtLevel, courtFee, interestDays, simpleInterest } from '@lawfirm/shared';
import type { CaseDetail, DateSuggestion, ProceedingKind, ReviewRoundSummary } from './api/types';
import { bangkokDayToIso } from './thai-date';
import { deadlineUrgency } from './deadline';

/** Court-event records refuse a closed or archived case ('คดีปิดแล้ว'); D8 hides deadline actions there too. */
export function canRecordProceedings(caseStatus: string | null | undefined): boolean {
  return !!caseStatus && caseStatus !== 'CLOSED' && caseStatus !== 'ARCHIVED';
}

/** fetch() throws a bare TypeError when the phone has no connection; the API always answers with a status. */
export function isNetworkError(error: unknown): boolean {
  return error instanceof TypeError;
}

export const OFFLINE_SAVE = 'ต้องต่อเน็ตเพื่อบันทึก';

/** What a lawyer reads when a legal action fails: the API's Thai message, never "HTTP 409" or English. */
export function actionErrorText(error: unknown): string {
  if (isNetworkError(error)) return OFFLINE_SAVE;
  const message = error instanceof Error ? error.message : '';
  if (/[฀-๿]/.test(message)) return message;
  const status = (error as { status?: unknown } | null)?.status;
  if (status === 403) return 'ไม่มีสิทธิ์ทำรายการนี้ในคดีนี้';
  if (status === 404) return 'ไม่พบรายการนี้แล้ว';
  return 'ลองใหม่อีกครั้ง';
}

/** Confirm/dismiss always target the suggestion's own case, never the screen's. */
export function suggestionRequest(
  suggestion: Pick<DateSuggestion, 'id' | 'caseId' | 'updatedAt' | 'source'>,
  action: 'confirm' | 'dismiss',
  leadLawyerId?: string | null,
): { path: string; body?: Record<string, string> } {
  const path = `/cases/${suggestion.caseId}/date-suggestions/${suggestion.id}/${action}`;
  if (action === 'dismiss') return { path };
  return {
    path,
    body: {
      // The API answers 409 when the row changed since we read it, instead of confirming a moved date.
      expectedUpdatedAt: suggestion.updatedAt,
      // A date read from a document needs a responsible lawyer; the case lead is who the notice went to.
      ...(suggestion.source === 'DOCUMENT' && leadLawyerId ? { assigneeId: leadLawyerId } : {}),
    },
  };
}

/** Only a reviewer named on a waiting round who has not decided yet may decide (API recordDecision). */
export function canDecideRound(round: Pick<ReviewRoundSummary, 'status' | 'reviewers'>, userId: string | null | undefined): boolean {
  return !!userId && round.status === 'WAITING_REVIEW' && round.reviewers.some((person) => person.id === userId && !person.decision);
}

export function reviewDecisionRequest(
  round: Pick<ReviewRoundSummary, 'id' | 'caseId' | 'documentId' | 'documentVersionId'>,
  action: 'approve' | 'return',
  reason?: string,
): { path: string; body: { action: 'approve' | 'return'; reviewedDocumentVersionId: string; reason?: string } } {
  const trimmed = reason?.trim();
  return {
    path: `/cases/${round.caseId}/documents/${round.documentId}/review-rounds/${round.id}/decision`,
    // The API rejects a decision on a version that changed while the screen was open.
    body: { action, reviewedDocumentVersionId: round.documentVersionId, ...(action === 'return' && trimmed ? { reason: trimmed } : {}) },
  };
}

/** D7: the note above a case rendered from cache after its refetch failed. */
export function cachedDataNote(error: unknown, updatedAt: number, now = new Date()): string {
  return isNetworkError(error)
    ? `ออฟไลน์ · ข้อมูลล่าสุด ${timeAgo(new Date(updatedAt), now)}`
    : 'โหลดข้อมูลล่าสุดไม่ได้ แสดงข้อมูลที่เก็บไว้';
}

const LEVELS = [CourtLevel.TRIAL, CourtLevel.APPEAL, CourtLevel.SUPREME];

/** Mirrors api common/limitation-reminder.ts: the limitation date stops mattering once the case is filed or closed. */
export function limitationRelevant(detail: Pick<CaseDetail, 'status' | 'blackCaseNumber' | 'proceedings'>): boolean {
  return canRecordProceedings(detail.status) && !detail.blackCaseNumber
    && !(detail.proceedings ?? []).some((row) => row.filedAt || row.blackCaseNumber || row.judgmentAt);
}

export interface CourtLevelRow {
  level: CourtLevel;
  current: boolean;
  /** Earlier and current levels read normally; later ones are muted ("ยังไม่ถึงชั้นนี้"). */
  reached: boolean;
  courtName: string | null;
  black: string | null;
  red: string | null;
}

/** One row per court level. The case's own court and numbers mirror the current level, so they fill its gaps. */
export function courtLevelRows(
  detail: Pick<CaseDetail, 'courtLevel' | 'courtName' | 'blackCaseNumber' | 'redCaseNumber' | 'proceedings'>,
): CourtLevelRow[] {
  const currentLevel = (detail.courtLevel ?? CourtLevel.TRIAL) as CourtLevel;
  const currentIndex = LEVELS.indexOf(currentLevel);
  return LEVELS.map((level, index) => {
    const row = (detail.proceedings ?? []).find((item) => item.courtLevel === level);
    const current = level === currentLevel;
    return {
      level,
      current,
      reached: index <= currentIndex,
      courtName: row?.courtName ?? (current ? detail.courtName : null),
      black: row?.blackCaseNumber ?? (current ? detail.blackCaseNumber : null),
      red: row?.redCaseNumber ?? (current ? detail.redCaseNumber : null),
    };
  });
}

export const PROCEEDING_LABELS: Record<ProceedingKind, string> = {
  filing: 'ยื่นฟ้อง',
  service: 'ส่งหมาย',
  judgment: 'อ่านคำพิพากษา',
  'appeal-served': 'ได้รับสำเนาอุทธรณ์',
};

const LEVEL_WORD: Record<CourtLevel, string> = {
  [CourtLevel.TRIAL]: 'ต้น',
  [CourtLevel.APPEAL]: 'อุทธรณ์',
  [CourtLevel.SUPREME]: 'ฎีกา',
};

/** The sheet's court-level switch: [ชั้นต้น|อุทธรณ์|ฎีกา]. */
export const LEVEL_TABS = LEVELS.map((level) => ({ value: level, label: level === CourtLevel.TRIAL ? 'ชั้นต้น' : LEVEL_WORD[level] }));

export interface ProceedingDraft {
  kind: ProceedingKind | null;
  level: CourtLevel;
  /** Bangkok day `YYYY-MM-DD`. */
  day: string | null;
  method: string;
  outcome: string;
}

/** The POST body for one court event, or null while a choice the API requires is missing. */
export function proceedingBody(draft: ProceedingDraft): Record<string, string> | null {
  if (!draft.kind || !draft.day) return null;
  const at = bangkokDayToIso(draft.day);
  switch (draft.kind) {
    case 'filing': return { filedAt: at, courtLevel: draft.level };
    case 'service': return draft.method ? { servedAt: at, method: draft.method } : null;
    case 'judgment': return draft.outcome ? { courtLevel: draft.level, judgmentAt: at, outcome: draft.outcome } : null;
    case 'appeal-served': return { servedAt: at };
  }
}

/** Filing and judgment take the chosen level; service and appeal-served land on the case's current one. */
export function proceedingLevel(kind: ProceedingKind, chosen: CourtLevel, current: CourtLevel): CourtLevel {
  return kind === 'filing' || kind === 'judgment' ? chosen : current;
}

/** What still blocks Save, worded as the next step; null when the draft can be sent. */
export function proceedingMissing(draft: ProceedingDraft, dayInvalid: boolean): string | null {
  if (!draft.kind) return 'เลือกเหตุการณ์ก่อน';
  if (draft.kind === 'service' && !draft.method) return 'เลือกวิธีส่งหมายก่อน';
  if (draft.kind === 'judgment' && !draft.outcome) return 'เลือกผลคำพิพากษาก่อน';
  if (!draft.day || dayInvalid) return 'ใส่วันที่ให้ครบก่อน';
  return null;
}

/**
 * The Alert before a legal record: there is no undo route, so this is the last check.
 * `detail` is the chosen service method or judgment outcome — it changes the deadlines.
 */
export function proceedingConfirm(kind: ProceedingKind, level: CourtLevel, day: string, detail?: string): { title: string; body: string } {
  return {
    title: `ยืนยันบันทึก${PROCEEDING_LABELS[kind]}`,
    body: `ชั้น${LEVEL_WORD[level]} · วันที่ ${thDate(bangkokDayToIso(day))}${detail ? ` · ${detail}` : ''}\n`
      + 'ระบบจะปรับขั้นตอนคดีและเสนอวันครบกำหนดให้ยืนยัน\nบันทึกแล้วยกเลิกไม่ได้',
  };
}

/** D3: the count from the response, and the stage only when the refetched case shows it moved. */
export function proceedingResultText(count: number, stageBefore?: string | null, stageAfter?: string | null): string {
  const parts = ['บันทึกแล้ว'];
  if (stageAfter && stageAfter !== stageBefore) {
    parts.push(`ขั้นตอนคดีเป็น "${CASE_STAGE_LABELS_TH[stageAfter as CaseStage] ?? stageAfter}"`);
  }
  parts.push(count > 0 ? `ระบบเสนอวันครบกำหนด ${count} รายการ รอยืนยัน` : 'ไม่มีวันครบกำหนดที่ต้องยืนยัน');
  return parts.join(' · ');
}

/**
 * Record, then describe. A failure returns `ok: false` and the caller keeps the sheet open with its input;
 * a failed case refetch after a successful record only drops the stage claim.
 */
export async function runProceeding(
  record: () => Promise<{ suggestions: number }>,
  stageAfter: () => Promise<string | null | undefined>,
  stageBefore: string | null | undefined,
): Promise<{ ok: true; text: string } | { ok: false; message: string }> {
  let result: { suggestions: number };
  try {
    result = await record();
  } catch (error) {
    return { ok: false, message: actionErrorText(error) };
  }
  const after = await stageAfter().catch(() => stageBefore);
  return { ok: true, text: proceedingResultText(result.suggestions, stageBefore, after) };
}

/** Home "ต้องจัดการก่อน": a single case opens its card; several open the waiting list narrowed to that kind. */
/** Home "วันครบกำหนดรอยืนยัน" detail: which case (or how many) and how close the nearest date is. */
export function deadlineQueueDetail(items: Array<{ ownRef: string; nearestDate: string }>, now: Date): string {
  if (!items.length) return '';
  const nearest = items.reduce((min, item) => (item.nearestDate < min ? item.nearestDate : min), items[0].nearestDate);
  const urgency = deadlineUrgency(nearest, now);
  const which = items.length === 1 ? items[0].ownRef : `${items.length} คดี`;
  return `${which} · ใกล้สุด ${thDate(nearest)}${urgency.label ? ` (${urgency.label})` : ''}`;
}

/** Home "เอกสารรอคุณตรวจ" detail: the one file and who sent it, or how many files. */
export function reviewQueueDetail(rounds: Array<{ filename: string; createdByName: string | null }>): string {
  if (rounds.length !== 1) return `${rounds.length} ฉบับ`;
  return rounds[0].createdByName ? `${rounds[0].filename} · จาก ${rounds[0].createdByName}` : rounds[0].filename;
}

export function queueRoute(caseIds: string[], section: 'deadlines' | 'documents'): string {
  const unique = [...new Set(caseIds)];
  if (unique.length === 1) return `/case/${unique[0]}?section=${section}`;
  return `/notifications?filter=${section === 'deadlines' ? 'deadline' : 'document'}`;
}

/** Item 8: null until an amount is typed; interest stays null until both days and a rate are there. */
export function litigationEstimate(input: { amount: string; rate: string; from: string | null; to: string | null }):
  { fee: number; days: number | null; interest: number | null } | null {
  const principal = Number(input.amount.replace(/,/g, ''));
  if (!input.amount.trim() || !Number.isFinite(principal) || principal < 0) return null;
  const rate = Number(input.rate);
  const days = input.from && input.to ? interestDays(input.from, input.to) : null;
  const interest = days != null && input.rate.trim() && Number.isFinite(rate) && rate >= 0
    ? simpleInterest(principal, rate, days)
    : null;
  return { fee: courtFee(principal), days, interest };
}
