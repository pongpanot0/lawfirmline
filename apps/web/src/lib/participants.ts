export const ROLE_LABELS: Record<string, string> = {
  PLAINTIFF: 'โจทก์',
  JOINT_PLAINTIFF: 'โจทก์ร่วม',
  DEFENDANT: 'จำเลย',
  JOINT_DEFENDANT: 'จำเลยร่วม',
  PETITIONER: 'ผู้ร้อง',
  RESPONDENT: 'ผู้คัดค้าน',
  WITNESS: 'พยาน',
  EXPERT: 'ผู้เชี่ยวชาญ',
  OPPOSING_LAWYER: 'ทนายฝ่ายตรงข้าม',
  OPPOSING_INSURER: 'บริษัทประกันฝ่ายตรงข้าม',
  OTHER: 'อื่นๆ',
};

export const SIDE_LABELS: Record<string, string> = {
  OURS: 'ฝ่ายเรา',
  OPPONENT: 'ฝ่ายตรงข้าม',
  NEUTRAL: 'กลาง',
};

/** Opposing counsel / insurer act for a party; that link is what `representedByParticipantId` records. */
export const COUNSEL_ROLES: readonly string[] = ['OPPOSING_LAWYER', 'OPPOSING_INSURER'];

export function participantPayload(form: Record<string, string>): Record<string, string | null> {
  const data: Record<string, string | null> = {};
  for (const [key, value] of Object.entries(form)) data[key] = value === '' ? null : value;
  if (form.side !== 'OURS') data.clientId = null;
  if (!COUNSEL_ROLES.includes(form.role)) data.representedByParticipantId = null;
  return data;
}
