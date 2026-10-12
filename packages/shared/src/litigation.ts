import type { ParticipantRole } from './index';

/** ฝ่ายที่สำนักงานเป็นทนายให้ (Case.partyRole). */
export enum PartyRole {
  PLAINTIFF = 'PLAINTIFF',
  DEFENDANT = 'DEFENDANT',
  /** ผู้ร้อง */
  PETITIONER = 'PETITIONER',
  /** ผู้คัดค้าน */
  RESPONDENT = 'RESPONDENT',
}

export const PARTY_ROLE_LABELS: Record<PartyRole, string> = {
  [PartyRole.PLAINTIFF]: 'โจทก์',
  [PartyRole.DEFENDANT]: 'จำเลย',
  [PartyRole.PETITIONER]: 'ผู้ร้อง',
  [PartyRole.RESPONDENT]: 'ผู้คัดค้าน',
};

export enum JudgmentOutcome {
  WON = 'WON',
  LOST = 'LOST',
  PARTIAL = 'PARTIAL',
  DISMISSED = 'DISMISSED',
  SETTLED = 'SETTLED',
}

export const JUDGMENT_OUTCOME_LABELS: Record<JudgmentOutcome, string> = {
  [JudgmentOutcome.WON]: 'ชนะคดี',
  [JudgmentOutcome.LOST]: 'แพ้คดี',
  [JudgmentOutcome.PARTIAL]: 'ชนะบางส่วน',
  [JudgmentOutcome.DISMISSED]: 'ยกฟ้อง',
  [JudgmentOutcome.SETTLED]: 'พิพากษาตามยอม',
};

const OPPOSITE: Record<PartyRole, string> = {
  [PartyRole.PLAINTIFF]: 'DEFENDANT',
  [PartyRole.DEFENDANT]: 'PLAINTIFF',
  [PartyRole.PETITIONER]: 'RESPONDENT',
  [PartyRole.RESPONDENT]: 'PETITIONER',
};

/** Our client's participant role: the PartyRole values are also ParticipantRole values. */
export function ourParticipantRole(partyRole: PartyRole | string): ParticipantRole {
  return partyRole as ParticipantRole;
}

/** The role an opponent takes when we are `partyRole`; OTHER when our side is unknown. */
export function opponentParticipantRole(partyRole: PartyRole | string | null | undefined): ParticipantRole {
  return (OPPOSITE[partyRole as PartyRole] ?? 'OTHER') as ParticipantRole;
}

/**
 * ค่าขึ้นศาล — ตาราง 1 ท้ายประมวลกฎหมายวิธีพิจารณาความแพ่ง
 * (แก้ไขโดย พ.ร.บ.แก้ไขเพิ่มเติม ป.วิ.พ. (ฉบับที่ 24) พ.ศ. 2551), cross-checked with secondary sources;
 * official krisdika.go.th unreachable 2026-10-12 — re-verify:
 *   (1) คำฟ้องที่มีทุนทรัพย์: ไม่เกิน 50,000,000 บาท ร้อยละ 2 แต่ไม่เกิน 200,000 บาท;
 *       ส่วนที่เกิน 50,000,000 บาท ร้อยละ 0.1
 *   (2) คดีไม่มีทุนทรัพย์: 200 บาท
 * Appeal and ฎีกา pay on the same table, on the amount still in dispute.
 * A fraction of a satang rounds up. Not covered: mortgage/arbitral-award items and คดีมโนสาเร่.
 * Source text: https://www.krisdika.go.th (ป.วิ.พ. ตาราง 1) — if it changes, change this and its tests.
 */
export const COURT_FEE_NON_MONEY = 200;
const FIRST_BAND_SATANG = 50_000_000 * 100;
const FIRST_BAND_CAP_SATANG = 200_000 * 100;

/**
 * @param amount ทุนทรัพย์ in baht; null = a claim with no money value.
 * @returns baht; 0 when `amount` is not a finite number (bad input — callers show "—").
 */
export function courtFee(amount: number | null): number {
  if (amount == null) return COURT_FEE_NON_MONEY;
  if (!Number.isFinite(amount)) return 0;
  // Integer satang so 2% / 0.1% never pick up float noise.
  const satang = Math.max(0, Math.round(amount * 100));
  const first = Math.min(Math.ceil((Math.min(satang, FIRST_BAND_SATANG) * 2) / 100), FIRST_BAND_CAP_SATANG);
  const above = Math.ceil(Math.max(0, satang - FIRST_BAND_SATANG) / 1000);
  return (first + above) / 100;
}

/** ป.พ.พ. ม.224 (แก้ไข 2564): 3% ตาม ม.7 + 2% = 5% ต่อปี — editable per calculation. */
export const DEFAULT_INTEREST_RATE = 5;

/** Simple interest in baht, rounded to satang: principal × rate × days / 365. */
export function simpleInterest(principal: number, ratePercent: number, days: number): number {
  return Math.round(((principal * ratePercent) / 100) * (days / 365) * 100) / 100;
}

/** Calendar days from one `YYYY-MM-DD` day to another (0 when `toDay` is earlier). */
export function interestDays(fromDay: string, toDay: string): number {
  const ms = Date.parse(`${toDay}T00:00:00Z`) - Date.parse(`${fromDay}T00:00:00Z`);
  return Number.isFinite(ms) ? Math.max(0, Math.round(ms / 86_400_000)) : 0;
}
