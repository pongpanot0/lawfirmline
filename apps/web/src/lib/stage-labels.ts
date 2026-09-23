import { CASE_STAGE_ORDER, CaseStage, INTAKE_STAGE_ORDER, IntakeStage } from '@lawfirm/shared';

type Locale = 'th' | 'en';

const CASE_STAGE_TH: Record<CaseStage, string> = {
  [CaseStage.INTAKE_REVIEW]: 'ก่อนฟ้อง',
  [CaseStage.FACT_GATHERING]: 'รวบรวมข้อเท็จจริง',
  [CaseStage.PRE_LITIGATION]: 'ก่อนฟ้อง',
  [CaseStage.FILING]: 'ยื่นฟ้อง',
  [CaseStage.ANSWER]: 'ยื่นคำให้การ',
  [CaseStage.MEDIATION]: 'ไกล่เกลี่ย',
  [CaseStage.HEARING]: 'สืบพยาน',
  [CaseStage.AWAITING_JUDGMENT]: 'รอคำพิพากษา',
  [CaseStage.ENFORCEMENT]: 'บังคับคดี',
  [CaseStage.CLOSING]: 'ปิดคดี',
  [CaseStage.APPEAL]: 'อุทธรณ์',
  [CaseStage.SUPREME]: 'ฎีกา',
};

const CASE_STAGE_EN: Record<CaseStage, string> = {
  [CaseStage.INTAKE_REVIEW]: 'Pre-litigation',
  [CaseStage.FACT_GATHERING]: 'Fact gathering',
  [CaseStage.PRE_LITIGATION]: 'Pre-litigation',
  [CaseStage.FILING]: 'Filing',
  [CaseStage.ANSWER]: 'Answer',
  [CaseStage.MEDIATION]: 'Mediation',
  [CaseStage.HEARING]: 'Hearing',
  [CaseStage.AWAITING_JUDGMENT]: 'Awaiting judgment',
  [CaseStage.ENFORCEMENT]: 'Enforcement',
  [CaseStage.CLOSING]: 'Closing',
  [CaseStage.APPEAL]: 'Appeal',
  [CaseStage.SUPREME]: 'Supreme Court',
};

const INTAKE_STAGE_TH: Record<IntakeStage, string> = {
  [IntakeStage.NEW_INQUIRY]: 'เรื่องใหม่',
  [IntakeStage.CONTACTED]: 'ติดต่อแล้ว',
  [IntakeStage.SCREENING]: 'กลั่นกรอง',
  [IntakeStage.CONFLICT_CHECK]: 'ตรวจ conflict',
  [IntakeStage.CONSULT_SCHEDULED]: 'นัดปรึกษา',
  [IntakeStage.CONSULTED]: 'ปรึกษาแล้ว',
  [IntakeStage.WAITING_DOCUMENTS]: 'รอเอกสาร',
  [IntakeStage.PRE_LITIGATION_NOTICE]: 'ออกหนังสือ',
  [IntakeStage.PROPOSAL]: 'เสนอรับงาน',
  [IntakeStage.CLOSED]: 'จบเรื่อง',
};

const INTAKE_STAGE_EN: Record<IntakeStage, string> = {
  [IntakeStage.NEW_INQUIRY]: 'New inquiry',
  [IntakeStage.CONTACTED]: 'Contacted',
  [IntakeStage.SCREENING]: 'Screening',
  [IntakeStage.CONFLICT_CHECK]: 'Conflict check',
  [IntakeStage.CONSULT_SCHEDULED]: 'Consultation scheduled',
  [IntakeStage.CONSULTED]: 'Consulted',
  [IntakeStage.WAITING_DOCUMENTS]: 'Waiting documents',
  [IntakeStage.PRE_LITIGATION_NOTICE]: 'Notice issued',
  [IntakeStage.PROPOSAL]: 'Proposal',
  [IntakeStage.CLOSED]: 'Closed',
};

export function caseStageLabel(stage: string, locale: Locale = 'th') {
  const table = locale === 'th' ? CASE_STAGE_TH : CASE_STAGE_EN;
  return table[stage as CaseStage] ?? stage;
}

export function intakeStageLabel(stage: string, locale: Locale = 'th') {
  const table = locale === 'th' ? INTAKE_STAGE_TH : INTAKE_STAGE_EN;
  return table[stage as IntakeStage] ?? stage;
}

export function caseStageOptions(locale: Locale = 'th') {
  return CASE_STAGE_ORDER.map((value) => ({ value, label: caseStageLabel(value, locale) }));
}

export function intakeStageOptions(locale: Locale = 'th') {
  return INTAKE_STAGE_ORDER.map((value) => ({ value, label: intakeStageLabel(value, locale) }));
}

const DOCUMENT_CATEGORY_TH: Record<string, string> = {
  PLEADING: 'คำคู่ความ',
  EVIDENCE: 'พยานหลักฐาน',
  CONTRACT: 'สัญญา',
  CORRESPONDENCE: 'หนังสือโต้ตอบ',
  COURT_ORDER: 'คำสั่ง/คำพิพากษาศาล',
  IDENTITY: 'เอกสารแสดงตน',
  MEDICAL: 'เอกสารการแพทย์',
  FINANCIAL: 'เอกสารการเงิน',
  INTERNAL: 'เอกสารภายใน',
  OTHER: 'อื่น ๆ',
};

const DOCUMENT_CATEGORY_EN: Record<string, string> = {
  PLEADING: 'Pleading',
  EVIDENCE: 'Evidence',
  CONTRACT: 'Contract',
  CORRESPONDENCE: 'Correspondence',
  COURT_ORDER: 'Court order',
  IDENTITY: 'Identity',
  MEDICAL: 'Medical',
  FINANCIAL: 'Financial',
  INTERNAL: 'Internal',
  OTHER: 'Other',
};

export function documentCategoryLabel(category: string, locale: Locale = 'th') {
  return (locale === 'th' ? DOCUMENT_CATEGORY_TH : DOCUMENT_CATEGORY_EN)[category] ?? category;
}

export const CONFLICT_RESULT_LABELS: Record<string, { th: string; en: string; tone: 'ok' | 'warn' | 'bad' }> = {
  CLEAR: { th: 'ไม่ขัดกัน', en: 'Clear', tone: 'ok' },
  POTENTIAL_CONFLICT: { th: 'อาจขัดกัน', en: 'Potential conflict', tone: 'warn' },
  CONFLICT: { th: 'ขัดกัน', en: 'Conflict', tone: 'bad' },
  NEEDS_REVIEW: { th: 'ต้องตรวจเพิ่ม', en: 'Needs review', tone: 'warn' },
};
