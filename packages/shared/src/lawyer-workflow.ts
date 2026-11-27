export enum IntakeDecision {
  FILE_SUIT = 'FILE_SUIT',
  DO_NOT_FILE = 'DO_NOT_FILE',
  NEGOTIATE_FIRST = 'NEGOTIATE_FIRST',
  SEND_NOTICE = 'SEND_NOTICE',
  COMPLAIN_TO_AUTHORITY = 'COMPLAIN_TO_AUTHORITY',
  CONSULTATION_ONLY = 'CONSULTATION_ONLY',
  PENDING = 'PENDING',
  NOT_WORTH_FILING = 'NOT_WORTH_FILING',
}

export const INTAKE_DECISION_LABELS: Record<IntakeDecision, string> = {
  [IntakeDecision.FILE_SUIT]: 'ฟ้อง',
  [IntakeDecision.DO_NOT_FILE]: 'ไม่ฟ้อง',
  [IntakeDecision.NEGOTIATE_FIRST]: 'เจรจาก่อน',
  [IntakeDecision.SEND_NOTICE]: 'ออกหนังสือทวงถาม',
  [IntakeDecision.COMPLAIN_TO_AUTHORITY]: 'ร้องเรียน',
  [IntakeDecision.CONSULTATION_ONLY]: 'ให้คำปรึกษาเท่านั้น (ไม่รับเป็นคดี)',
  [IntakeDecision.PENDING]: 'รอตัดสินใจ',
  [IntakeDecision.NOT_WORTH_FILING]: 'ไม่คุ้มค่าที่จะฟ้อง (ให้ลูกความตัดสินใจ)',
};

export const CLIENT_DECISIONS = ['PENDING', 'FILE', 'DROP'] as const;
export type ClientDecision = (typeof CLIENT_DECISIONS)[number];

export const CLIENT_DECISION_LABELS: Record<ClientDecision, string> = {
  PENDING: 'รอคำตอบลูกความ',
  FILE: 'ฟ้องต่อ',
  DROP: 'ไม่ฟ้อง ปิดเรื่อง',
};

export function effectiveIntakeDecision<Decision extends string>(
  decision: Decision,
  clientDecision?: string | null,
): Decision | IntakeDecision {
  if (decision !== IntakeDecision.NOT_WORTH_FILING) return decision;
  if (clientDecision === 'FILE') return IntakeDecision.SEND_NOTICE;
  if (clientDecision === 'DROP') return IntakeDecision.DO_NOT_FILE;
  return IntakeDecision.PENDING;
}

export enum CourtFollowUpKind {
  ACCEPTANCE = 'ACCEPTANCE',
  SERVICE = 'SERVICE',
  ANSWER = 'ANSWER',
}

export const COURT_FOLLOW_UP_LABELS: Record<CourtFollowUpKind, string> = {
  ACCEPTANCE: 'โทรถามศาล: รับฟ้องหรือยัง / คำฟ้องหรือคำแถลงขอปิดหมายติดปัญหาไหม',
  SERVICE: 'โทรถามศาล: ส่งหมายให้จำเลยได้หรือยัง ส่งด้วยวิธีไหน',
  ANSWER: 'โทรถามศาล: จำเลยยื่นคำให้การหรือยัง (ถ้ายังไม่ยื่น ขอให้พิพากษาโดยขาดนัด)',
};

export enum AnswerExtensionStatus {
  PENDING = 'PENDING',
  GRANTED = 'GRANTED',
  DENIED = 'DENIED',
}

export interface CourtFollowUpItem {
  kind: `${CourtFollowUpKind}`;
  dueAt: string;
  doneAt: string | null;
  lastResult: string | null;
  attempts: number;
}

export interface AnswerExtensionItem {
  id: string;
  filedAt: string;
  requestedUntil: string;
  status: `${AnswerExtensionStatus}`;
  grantedUntil: string | null;
}

export interface AnswerDeadlineItem {
  answerDueAt: string | null;
  effectiveDueAt: string | null;
  fileBy: string | null;
  extensions: AnswerExtensionItem[];
}

export const POLICY_TYPES = [
  'Marine Cargo',
  'Motor',
  'Fire / Property',
  'Liability',
  'Engineering',
  'Health / PA',
  'Other',
] as const;

export const POLICY_TYPE_LABELS: Record<(typeof POLICY_TYPES)[number], string> = {
  'Marine Cargo': 'Marine Cargo (ขนส่งสินค้าทางทะเล)',
  Motor: 'Motor (รถยนต์)',
  'Fire / Property': 'Fire / Property (อัคคีภัย / ทรัพย์สิน)',
  Liability: 'Liability (ความรับผิด)',
  Engineering: 'Engineering (วิศวกรรม)',
  'Health / PA': 'Health / PA (สุขภาพ / อุบัติเหตุ)',
  Other: 'อื่น ๆ',
};
