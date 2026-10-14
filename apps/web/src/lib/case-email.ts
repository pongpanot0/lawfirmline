import type { CaseEmailThreadItem, CaseMatchReason, OutlookFolderRow, ThreadMatchReason } from './api';

export const OTHER_CASE = '__other__';

export const MATCH_REASON_LABELS: Record<CaseMatchReason, string> = {
  OWN_REF: 'ตรงเลขอ้างอิง',
  CASE_NUMBER: 'ตรงเลขคดี',
  CLIENT_NAME: 'ตรงชื่อลูกความ',
};

export const THREAD_REASON_LABELS: Record<ThreadMatchReason, string> = {
  CONTACT_EMAIL: 'อีเมลตรงกับลูกความ/ผู้ติดต่อในคดี',
  OWN_REF: 'หัวเรื่องมีเลขอ้างอิง',
  CASE_NUMBER: 'หัวเรื่องมีเลขคดี',
};

export interface EmailTimelineItem {
  id: string;
  label: string;
  date: string;
  type: 'EMAIL';
  from: string;
}

/** Case timeline rows read straight from email threads — no CaseActivity is written for email. */
export function emailTimelineItems(
  threads: Pick<CaseEmailThreadItem, 'id' | 'subject' | 'lastMessageAt' | 'fromName' | 'fromAddress'>[],
): EmailTimelineItem[] {
  return threads.map((thread) => ({
    id: `email-${thread.id}`,
    label: `อีเมล: ${thread.subject}`,
    date: thread.lastMessageAt,
    type: 'EMAIL',
    from: thread.fromName ?? thread.fromAddress ?? 'ไม่ทราบผู้ส่ง',
  }));
}

/**
 * Pre-fill for the folder-match table (nothing is linked until "ยืนยัน"):
 * only when exactly one Own Ref / case-number match exists; client-name-only
 * or conflicting matches stay blank for the person to decide.
 */
export function defaultFolderCaseId(row: Pick<OutlookFolderRow, 'link' | 'suggestions'>): string {
  if (row.link) return '';
  const strong = [...new Set(row.suggestions.filter((s) => s.reason !== 'CLIENT_NAME').map((s) => s.caseId))];
  return strong.length === 1 ? strong[0] : '';
}
