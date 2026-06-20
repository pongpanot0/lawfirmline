export enum Role {
  ADMIN = 'ADMIN',
  LAWYER = 'LAWYER',
  CLERK = 'CLERK',
}

export enum CaseStatus {
  OPEN = 'OPEN',
  DRAFTING = 'DRAFTING',
  COURT_DATE = 'COURT_DATE',
  IN_PROGRESS = 'IN_PROGRESS',
  PENDING = 'PENDING',
  CLOSED = 'CLOSED',
}

export enum TaskStatus {
  TODO = 'TODO',
  IN_PROGRESS = 'IN_PROGRESS',
  DONE = 'DONE',
}

export enum AssignmentType {
  LEAD = 'LEAD',
  CO_COUNSEL = 'CO_COUNSEL',
  CLERK = 'CLERK',
}

export enum EventType {
  COURT_DATE = 'COURT_DATE',
  CLIENT_MEETING = 'CLIENT_MEETING',
  DEADLINE = 'DEADLINE',
  OTHER = 'OTHER',
}

export enum ExpenseStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  PAID = 'PAID',
  REJECTED = 'REJECTED',
}

export enum InvoiceStatus {
  DRAFT = 'DRAFT',
  SENT = 'SENT',
  PAID = 'PAID',
}

export enum KnowledgeCategory {
  SUMMARY = 'SUMMARY',
  CONTRACT = 'CONTRACT',
  COURT_ORDER = 'COURT_ORDER',
  CORRESPONDENCE = 'CORRESPONDENCE',
  OTHER = 'OTHER',
}

export const EXPENSE_CATEGORIES = [
  'ค่าเดินทาง',
  'ค่าธรรมเนียมศาล',
  'ค่าคัดสำเนา',
  'ค่าอุปกรณ์สำนักงาน',
  'ค่าที่พัก',
  'อื่นๆ',
] as const;

export interface CaseFieldSchema {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select';
  required?: boolean;
  options?: string[];
}

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  aiCredits?: number;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}
