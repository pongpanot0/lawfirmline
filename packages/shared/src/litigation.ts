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
