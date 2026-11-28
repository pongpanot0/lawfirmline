/**
 * Thai civil court filing fee (ค่าขึ้นศาล) estimate — ตาราง 1 ท้าย ป.วิ.พ. and the special acts.
 * Source and caveats: docs/research/2026-11-15-thai-legal-fee-schedules.md §4.
 * It is an ESTIMATE the user confirms against the court receipt; multi-claim / multi-party cases,
 * refunds and enforcement fees (ตาราง 5) are out of scope.
 */
export const COURT_FEE_RULE_VERSION = 'ป.วิ.พ. ตาราง 1 · ตรวจ 15 พ.ย. 2569';

export type CourtFeeCaseKind =
  | 'GENERAL'              // คำฟ้องทั่วไป มีทุนทรัพย์
  | 'ARBITRATION_DOMESTIC' // บังคับ/เพิกถอนคำชี้ขาดในประเทศ
  | 'ARBITRATION_FOREIGN'  // บังคับ/เพิกถอนคำชี้ขาดต่างประเทศ
  | 'MORTGAGE'             // บังคับจำนอง / เอาทรัพย์จำนองหลุด
  | 'NON_MONETARY'         // ไม่มีทุนทรัพย์ / ไม่มีข้อพิพาท
  | 'MIXED'                // มีคำขอทั้งเป็นเงินและไม่เป็นเงิน
  | 'SMALL_CLAIM'          // มโนสาเร่
  | 'CONSUMER'             // คดีผู้บริโภค (ผู้บริโภคฟ้อง)
  | 'LABOUR'               // คดีแรงงาน
  | 'ADMIN'                // ศาลปกครอง คำขอให้ชดใช้เงิน
  | 'BANKRUPTCY';          // ฟ้องล้มละลาย

export type CourtLevel = 'TRIAL' | 'APPEAL' | 'SUPREME';

export interface CourtFeeInput { kind: CourtFeeCaseKind; level: CourtLevel; claimAmount?: number }
export interface CourtFeeResult { fee: number; lines: { label: string; amount: number }[]; notes: string[]; ruleVersion: string }

const FIRST_TIER = 50_000_000;
const EXCESS_RATE = 0.001;
const RATES: Record<'GENERAL' | 'ARBITRATION_DOMESTIC' | 'ARBITRATION_FOREIGN' | 'MORTGAGE', { rate: number; cap: number }> = {
  GENERAL: { rate: 0.02, cap: 200_000 },
  ARBITRATION_DOMESTIC: { rate: 0.005, cap: 50_000 },
  ARBITRATION_FOREIGN: { rate: 0.01, cap: 100_000 },
  MORTGAGE: { rate: 0.01, cap: 100_000 },
};
const FLAT_NON_MONETARY = 200;
const SMALL_CLAIM_TRIAL_CAP = 1_000;
const BANKRUPTCY_FEE = 500;

const baht = (n: number) => n.toLocaleString('th-TH');

/** Cap applies to the first 50 M only; the excess adds 0.1 %. Fractions of a baht are dropped. */
export function monetaryCourtFee(claim: number, kind: keyof typeof RATES = 'GENERAL'): { fee: number; lines: { label: string; amount: number }[] } {
  const { rate, cap } = RATES[kind];
  const first = Math.min(rate * Math.min(claim, FIRST_TIER), cap);
  const excess = EXCESS_RATE * Math.max(claim - FIRST_TIER, 0);
  const lines = [{ label: `ส่วนไม่เกิน 50 ล้าน: ${rate * 100}% (เพดาน ${baht(cap)})`, amount: Math.floor(first) }];
  if (excess > 0) lines.push({ label: 'ส่วนที่เกิน 50 ล้าน: 0.1%', amount: Math.floor(excess) });
  return { fee: Math.floor(first + excess), lines };
}

/**
 * Civil enforcement fee (ค่าธรรมเนียมบังคับคดี) per event — ตาราง 5 as amended by ป.วิ.พ. ฉบับที่ 33,
 * effective 10 ก.ย. 2568 (LED notice 12 ก.ย. 2568). Research §4.7: rounding and multi-event bases are
 * UNVERIFIED, so this is one event at a time and excludes announcement costs and officer advances.
 */
export const ENFORCEMENT_FEE_RULE_VERSION = 'ประกาศกรมบังคับคดี 12 ก.ย. 2568';

export type EnforcementEvent = 'SALE' | 'PAYOUT' | 'BID' | 'NO_SALE';

const ENFORCEMENT_RATES: Record<EnforcementEvent, number> = { SALE: 0.02, PAYOUT: 0.01, BID: 0.01, NO_SALE: 0 };

export function estimateEnforcementFee(input: { event: EnforcementEvent; amount?: number }): { fee: number; rate: number; ruleVersion: string } {
  const rate = ENFORCEMENT_RATES[input.event];
  const amount = Math.max(0, input.amount ?? 0);
  return { fee: Math.floor(rate * amount), rate, ruleVersion: ENFORCEMENT_FEE_RULE_VERSION };
}

export function estimateCourtFee(input: CourtFeeInput): CourtFeeResult {
  const { kind, level } = input;
  const claim = Math.max(0, input.claimAmount ?? 0);
  const notes: string[] = [];
  const out = (fee: number, lines: { label: string; amount: number }[]) => ({ fee, lines, notes, ruleVersion: COURT_FEE_RULE_VERSION });
  const needsClaim = !['NON_MONETARY', 'CONSUMER', 'LABOUR', 'BANKRUPTCY'].includes(kind);
  if (needsClaim && !(input.claimAmount! > 0)) notes.push('ยังไม่ได้ระบุทุนทรัพย์ — ยอดที่แสดงยังไม่ใช่ค่าขึ้นศาลจริง');
  if (level !== 'TRIAL') notes.push('ชั้นอุทธรณ์/ฎีกาคิดจากทุนทรัพย์ที่ยังพิพาทในชั้นนั้น (ม.150) ไม่ใช่ทุนทรัพย์เดิม');

  switch (kind) {
    case 'CONSUMER':
      notes.push('ผู้บริโภคได้รับยกเว้นค่าธรรมเนียม (พ.ร.บ.วิธีพิจารณาคดีผู้บริโภค ม.18) — ศาลอาจสั่งให้ชำระภายหลังได้');
      return out(0, [{ label: 'ยกเว้นค่าขึ้นศาล', amount: 0 }]);
    case 'LABOUR':
      notes.push('คดีแรงงานได้รับยกเว้นค่าฤชาธรรมเนียม (พ.ร.บ.จัดตั้งศาลแรงงานฯ ม.27)');
      return out(0, [{ label: 'ยกเว้นค่าขึ้นศาล', amount: 0 }]);
    case 'NON_MONETARY':
      return out(FLAT_NON_MONETARY, [{ label: 'คำขอที่ประเมินเป็นเงินไม่ได้', amount: FLAT_NON_MONETARY }]);
    case 'BANKRUPTCY':
      notes.push('ต้องวางเงินประกันค่าใช้จ่ายอีก 5,000 บาท (ม.11) — บันทึกแยกเป็นค่าใช้จ่ายอีกรายการ');
      return out(BANKRUPTCY_FEE, [{ label: 'ฟ้องให้ล้มละลาย (ม.179)', amount: BANKRUPTCY_FEE }]);
    case 'MIXED': {
      const monetary = monetaryCourtFee(claim);
      const fee = Math.max(monetary.fee, FLAT_NON_MONETARY);
      notes.push('มีคำขอทั้งเป็นเงินและไม่เป็นเงิน: คิดตามทุนทรัพย์ แต่ไม่น้อยกว่า 200 บาท');
      return out(fee, monetary.fee >= FLAT_NON_MONETARY ? monetary.lines : [{ label: 'ขั้นต่ำคำขอที่ไม่เป็นเงิน', amount: FLAT_NON_MONETARY }]);
    }
    case 'SMALL_CLAIM': {
      const monetary = monetaryCourtFee(claim);
      if (level !== 'TRIAL') return out(monetary.fee, monetary.lines);
      notes.push('มโนสาเร่ชั้นต้น: ค่าขึ้นศาลรวมไม่เกิน 1,000 บาท (ม.190 จัตวา)');
      if (monetary.fee <= SMALL_CLAIM_TRIAL_CAP) return out(monetary.fee, monetary.lines);
      notes.push(`ตามอัตราปกติจะเป็น ${baht(monetary.fee)} บาท`);
      return out(SMALL_CLAIM_TRIAL_CAP, [{ label: 'มโนสาเร่ชั้นต้น (เพดาน 1,000 บาท)', amount: SMALL_CLAIM_TRIAL_CAP }]);
    }
    case 'ADMIN': {
      // ระเบียบศาลปกครอง ข้อ 34: ทุนทรัพย์ต่ำกว่า 100 นับเป็น 100; เศษร้อยตั้งแต่ 50 ปัดขึ้น
      const base = Math.max(100, 100 * Math.floor((claim + 50) / 100));
      notes.push('ศาลปกครองเก็บค่าธรรมเนียมเฉพาะคำขอให้ชดใช้เงินหรือส่งมอบทรัพย์ (ม.45 วรรคสี่) ตรวจฉบับระเบียบล่าสุดก่อนใช้');
      return out(monetaryCourtFee(base).fee, monetaryCourtFee(base).lines);
    }
    default: {
      const monetary = monetaryCourtFee(claim, kind);
      return out(monetary.fee, monetary.lines);
    }
  }
}
