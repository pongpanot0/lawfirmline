import type { DateSuggestion, ReviewRoundSummary } from './api/types';

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
