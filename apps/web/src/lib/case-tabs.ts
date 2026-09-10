export const CASE_TAB_IDS = [
  'overview',
  'tasks',
  'calendar',
  'documents',
  'billing',
  'insurance',
  'messages',
  'closing-report',
] as const;

export type CaseTabId = (typeof CASE_TAB_IDS)[number];

export const CASE_TAB_LABELS: Record<CaseTabId, string> = {
  overview: 'ภาพรวม',
  tasks: 'งาน',
  calendar: 'ปฏิทิน',
  documents: 'เอกสาร',
  billing: 'ค่าใช้จ่าย',
  insurance: 'ประกัน',
  messages: 'ข้อความ',
  'closing-report': 'รายงานปิดงาน',
};

export function parseCaseTab(value: string | null | undefined): CaseTabId {
  if (value && (CASE_TAB_IDS as readonly string[]).includes(value)) {
    return value as CaseTabId;
  }
  return 'overview';
}

export function caseTabHref(caseId: string, tab: CaseTabId): string {
  if (tab === 'overview') return `/cases/${caseId}`;
  return `/cases/${caseId}?tab=${tab}`;
}
