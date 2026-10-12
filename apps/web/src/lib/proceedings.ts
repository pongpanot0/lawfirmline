import { JUDGMENT_OUTCOME_LABELS, type CourtLevel, type JudgmentOutcome } from '@lawfirm/shared';

export interface CaseProceedingItem {
  id: string;
  caseId: string;
  courtLevel: CourtLevel;
  courtName: string | null;
  blackCaseNumber: string | null;
  redCaseNumber: string | null;
  filedAt: string | null;
  judgmentAt: string | null;
  judgmentOutcome: JudgmentOutcome | null;
  /** Prisma Decimal — serialised as a string. */
  judgmentAmount: string | number | null;
  judgmentNote: string | null;
}

const ORDER = ['TRIAL', 'APPEAL', 'SUPREME'];

export function sortProceedings<T extends { courtLevel: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => ORDER.indexOf(a.courtLevel) - ORDER.indexOf(b.courtLevel));
}

export function proceedingNumbers(p: Pick<CaseProceedingItem, 'blackCaseNumber' | 'redCaseNumber'>): string {
  const parts = [p.blackCaseNumber && `ดำ ${p.blackCaseNumber}`, p.redCaseNumber && `แดง ${p.redCaseNumber}`].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'ยังไม่มีเลขคดี';
}

const thaiDate = (iso: string) =>
  new Date(iso).toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'numeric', year: 'numeric' });

export function judgmentLine(p: Pick<CaseProceedingItem, 'judgmentAt' | 'judgmentOutcome' | 'judgmentAmount'>): string | null {
  if (!p.judgmentAt) return null;
  const amount = p.judgmentAmount == null ? null : Number(p.judgmentAmount);
  return [
    `พิพากษา ${thaiDate(p.judgmentAt)}`,
    p.judgmentOutcome && JUDGMENT_OUTCOME_LABELS[p.judgmentOutcome],
    amount != null && `${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท`,
  ].filter(Boolean).join(' · ');
}
