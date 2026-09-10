export enum Role {
  ADMIN = 'ADMIN',
  LAWYER = 'LAWYER',
}

export enum FirmRole {
  OWNER = 'OWNER',
  SENIOR_LAWYER = 'SENIOR_LAWYER',
  LAWYER = 'LAWYER',
  ASSISTANT = 'ASSISTANT',
}

/** Subdomains that cannot be claimed as a firm slug. */
export const RESERVED_FIRM_SLUGS = [
  'www',
  'api',
  'app',
  'admin',
  'mail',
  'portal',
  'static',
  'assets',
] as const;

export const DEFAULT_ROOT_DOMAIN = 'samnuan.com';

export function isReservedFirmSlug(slug: string): boolean {
  return (RESERVED_FIRM_SLUGS as readonly string[]).includes(slug.toLowerCase());
}

/**
 * Extract firm slug from a Host header.
 * Returns null for apex / www / api / unknown hosts (no tenant).
 */
export function extractFirmSlugFromHost(
  hostHeader: string | null | undefined,
  rootDomain: string = DEFAULT_ROOT_DOMAIN,
): string | null {
  if (!hostHeader) return null;
  const host = hostHeader.split(':')[0]?.toLowerCase().trim();
  if (!host) return null;

  const root = rootDomain.toLowerCase();
  if (host === root || host === `www.${root}` || host === `api.${root}`) {
    return null;
  }
  if (host.endsWith(`.${root}`)) {
    const sub = host.slice(0, -(root.length + 1));
    if (!sub || sub.includes('.') || isReservedFirmSlug(sub)) return null;
    return sub;
  }

  // Dev: thesiambarristers.localhost
  if (host.endsWith('.localhost')) {
    const sub = host.slice(0, -'.localhost'.length);
    if (!sub || sub.includes('.') || isReservedFirmSlug(sub)) return null;
    return sub;
  }

  return null;
}

function splitHostPort(hostHeader: string): { hostname: string; port: string } {
  const trimmed = hostHeader.trim();
  const idx = trimmed.lastIndexOf(':');
  if (idx > -1 && /^\d+$/.test(trimmed.slice(idx + 1))) {
    return { hostname: trimmed.slice(0, idx).toLowerCase(), port: trimmed.slice(idx + 1) };
  }
  return { hostname: trimmed.toLowerCase(), port: '' };
}

/**
 * Build the origin for a firm's subdomain, preserving localhost/port for local dev.
 */
export function buildFirmAppOrigin(opts: {
  firmSlug: string;
  currentHost: string;
  protocol?: string;
  rootDomain?: string;
}): string {
  const rootDomain = (opts.rootDomain ?? DEFAULT_ROOT_DOMAIN).toLowerCase();
  const protocol = opts.protocol ?? 'https:';
  const { hostname, port } = splitHostPort(opts.currentHost);
  const slug = opts.firmSlug.toLowerCase();

  const isLocal =
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '127.0.0.1';

  if (isLocal) {
    const host = `${slug}.localhost${port ? `:${port}` : ''}`;
    return `${protocol}//${host}`;
  }

  return `${protocol}//${slug}.${rootDomain}`;
}

/** True when the browser is not already on the user's firm subdomain. */
export function needsFirmHostRedirect(
  currentHost: string,
  firmSlug: string,
  rootDomain: string = DEFAULT_ROOT_DOMAIN,
): boolean {
  const currentSlug = extractFirmSlugFromHost(currentHost, rootDomain);
  return currentSlug !== firmSlug.toLowerCase();
}

export enum SubscriptionPlan {
  SOLO = 'SOLO',
  FIRM = 'FIRM',
  PROFESSIONAL = 'PROFESSIONAL',
}

export enum SubscriptionStatus {
  TRIAL = 'TRIAL',
  ACTIVE = 'ACTIVE',
  PAST_DUE = 'PAST_DUE',
  CANCELED = 'CANCELED',
  EXPIRED = 'EXPIRED',
}

export enum BillingPaymentStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  FAILED = 'FAILED',
}

export enum BillingPeriod {
  MONTHLY = 'MONTHLY',
  YEARLY = 'YEARLY',
}

/** Yearly billing charges 10 months up front (2 months free). */
export const YEARLY_BILLED_MONTHS = 10;

export function planPriceThb(plan: SubscriptionPlan, period: BillingPeriod): number {
  const monthly = PLAN_CONFIG[plan].priceThb;
  return period === BillingPeriod.YEARLY ? monthly * YEARLY_BILLED_MONTHS : monthly;
}

export interface PlanConfig {
  plan: SubscriptionPlan;
  name: string;
  priceThb: number;
  maxUsers: number;
  features: string[];
  hasTeamManagement: boolean;
  hasAdvancedReporting: boolean;
  hasAuditLogs: boolean;
}

export const PLAN_CONFIG: Record<SubscriptionPlan, PlanConfig> = {
  [SubscriptionPlan.SOLO]: {
    plan: SubscriptionPlan.SOLO,
    name: 'Solo',
    priceThb: 990,
    maxUsers: 2,
    features: ['จัดการคดี', 'ปฏิทิน', 'พอร์ทัลลูกความ', 'แจ้งเตือนผ่าน LINE'],
    hasTeamManagement: false,
    hasAdvancedReporting: false,
    hasAuditLogs: false,
  },
  [SubscriptionPlan.FIRM]: {
    plan: SubscriptionPlan.FIRM,
    name: 'Firm',
    priceThb: 2999,
    maxUsers: 5,
    features: ['จัดการคดี', 'ปฏิทิน', 'พอร์ทัลลูกความ', 'แจ้งเตือนผ่าน LINE', 'จัดการทีม'],
    hasTeamManagement: true,
    hasAdvancedReporting: false,
    hasAuditLogs: false,
  },
  [SubscriptionPlan.PROFESSIONAL]: {
    plan: SubscriptionPlan.PROFESSIONAL,
    name: 'Professional',
    priceThb: 6999,
    maxUsers: 20,
    features: ['ทุกอย่างในแพ็กเกจ Firm', 'รายงานขั้นสูง', 'บันทึกการตรวจสอบ (Audit Log)'],
    hasTeamManagement: true,
    hasAdvancedReporting: true,
    hasAuditLogs: true,
  },
};

export const TRIAL_DAYS = 30;

/** Placeholder client name when creating a case before client details are known. */
export const TMP_CLIENT_PLACEHOLDER = 'tmp';

export enum CaseStatus {
  OPEN = 'OPEN',
  DRAFTING = 'DRAFTING',
  COURT_DATE = 'COURT_DATE',
  IN_PROGRESS = 'IN_PROGRESS',
  PENDING = 'PENDING',
  CLOSED = 'CLOSED',
}

export enum CourtLevel {
  TRIAL = 'TRIAL',
  APPEAL = 'APPEAL',
  SUPREME = 'SUPREME',
}

export const COURT_LEVEL_LABELS: Record<CourtLevel, string> = {
  [CourtLevel.TRIAL]: 'ศาลชั้นต้น',
  [CourtLevel.APPEAL]: 'ศาลอุทธรณ์',
  [CourtLevel.SUPREME]: 'ศาลฎีกา',
};

export enum TaskStatus {
  TODO = 'TODO',
  IN_PROGRESS = 'IN_PROGRESS',
  PENDING_REVIEW = 'PENDING_REVIEW',
  NEEDS_REVISION = 'NEEDS_REVISION',
  DONE = 'DONE',
}

/** Per-case helper role. Case Owner is stored on Case.leadLawyerId, not here. */
export enum AssignmentType {
  BUDDY = 'BUDDY',
}

export const ASSIGNMENT_TYPE_LABELS: Record<AssignmentType, string> = {
  [AssignmentType.BUDDY]: 'Buddy / ผู้ช่วย',
};

/** History of who a Task was assigned to / handed off to / rejected back to, and when. */
export enum TaskLogAction {
  ASSIGNED = 'ASSIGNED',
  HANDED_OFF = 'HANDED_OFF',
  REJECTED = 'REJECTED',
}

export enum EventType {
  COURT_DATE = 'COURT_DATE',
  CLIENT_MEETING = 'CLIENT_MEETING',
  DEADLINE = 'DEADLINE',
  OTHER = 'OTHER',
}

export enum DateSuggestionStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  DISMISSED = 'DISMISSED',
}

export enum ExpenseStatus {
  /** Saved by its author and not yet claimed — no money is committed. */
  DRAFT = 'DRAFT',
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  PAID = 'PAID',
  REJECTED = 'REJECTED',
}

/** A batch of expenses submitted together for owner review. */
export enum ExpenseClaimStatus {
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

export enum ActivityType {
  COURT_DATE = 'COURT_DATE',
  CLIENT_MEETING = 'CLIENT_MEETING',
  FILING = 'FILING',
  DEADLINE = 'DEADLINE',
  NOTE = 'NOTE',
  TASK = 'TASK',
  OTHER = 'OTHER',
}

export enum ParticipantRole {
  PLAINTIFF = 'PLAINTIFF',
  DEFENDANT = 'DEFENDANT',
  PETITIONER = 'PETITIONER',
  RESPONDENT = 'RESPONDENT',
  WITNESS = 'WITNESS',
  EXPERT = 'EXPERT',
  OPPOSING_LAWYER = 'OPPOSING_LAWYER',
  OPPOSING_INSURER = 'OPPOSING_INSURER',
  OTHER = 'OTHER',
}

export enum ParticipantSide {
  OURS = 'OURS',
  OPPONENT = 'OPPONENT',
  NEUTRAL = 'NEUTRAL',
}

export enum InsuranceClaimStage {
  CLAIM_FILED = 'CLAIM_FILED',
  DENIED_OR_PARTIAL = 'DENIED_OR_PARTIAL',
  DEMAND_SENT = 'DEMAND_SENT',
  OIC_COMPLAINT = 'OIC_COMPLAINT',
  SUIT_FILED = 'SUIT_FILED',
}

export const INSURANCE_CLAIM_STAGE_ORDER: InsuranceClaimStage[] = [
  InsuranceClaimStage.CLAIM_FILED,
  InsuranceClaimStage.DENIED_OR_PARTIAL,
  InsuranceClaimStage.DEMAND_SENT,
  InsuranceClaimStage.OIC_COMPLAINT,
  InsuranceClaimStage.SUIT_FILED,
]

export const INSURANCE_CLAIM_STAGE_LABELS: Record<InsuranceClaimStage, string> = {
  [InsuranceClaimStage.CLAIM_FILED]: 'ยื่นเคลม',
  [InsuranceClaimStage.DENIED_OR_PARTIAL]: 'ถูกปฏิเสธ/จ่ายไม่ครบ',
  [InsuranceClaimStage.DEMAND_SENT]: 'ทวงถาม/สงวนสิทธิ์',
  [InsuranceClaimStage.OIC_COMPLAINT]: 'ร้องเรียน คปภ.',
  [InsuranceClaimStage.SUIT_FILED]: 'ยื่นฟ้อง',
}

export const DEFAULT_THAI_COURTS = [
  'ศาลแพ่งกรุงเทพใต้',
  'ศาลแพ่งกรุงเทพเหนือ',
  'ศาลแพ่งธนบุรี',
  'ศาลแพ่งกรุงเทพกลาง',
  'ศาลอาญากรุงเทพใต้',
  'ศาลอาญากรุงเทพเหนือ',
  'ศาลอาญาธนบุรี',
  'ศาลแรงงานกลาง',
  'ศาลทรัพย์สินทางปัญญาและการค้าระหว่างประเทศกลาง',
  'ศาลปกครองกลาง',
] as const;

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

export interface DefaultCaseTypeDefinition {
  name: string;
  description: string;
  fieldSchema?: CaseFieldSchema[];
}

export const DEFAULT_CASE_TYPES: DefaultCaseTypeDefinition[] = [
  {
    name: 'Litigation',
    description: 'คดีความ / ฟ้องร้อง',
    fieldSchema: [
      { key: 'claimAmount', label: 'Claim Amount / มูลค่าความเสียหาย', type: 'number' },
      { key: 'opposingParty', label: 'Opposing Party / คู่ความ', type: 'text' },
    ],
  },
  {
    name: 'Corporate',
    description: 'นิติกรรม / บริษัท',
  },
  {
    name: 'Family Law',
    description: 'ครอบครัว / มรดก',
  },
  {
    name: 'Criminal',
    description: 'คดีอาญา',
    fieldSchema: [
      { key: 'chargeSection', label: 'Charge Section / ข้อหา', type: 'text', required: true },
      { key: 'prosecutor', label: 'Prosecutor / อัยการ', type: 'text' },
    ],
  },
  {
    name: 'Intellectual Property',
    description: 'ทรัพย์สินทางปัญญา',
  },
];

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  firmId: string;
  firmSlug: string;
  firmName: string;
  firmRole: FirmRole;
  subscriptionStatus: SubscriptionStatus;
  subscriptionPlan: SubscriptionPlan | null;
  trialEndAt: string | null;
  currentPeriodEnd: string | null;
  maxUsers: number;
  aiCredits?: number;
  /** @deprecated use firmRole */
  role?: Role;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export interface SubscriptionSummary {
  status: SubscriptionStatus;
  plan: SubscriptionPlan | null;
  trialEndAt: string | null;
  currentPeriodEnd: string | null;
  daysRemaining: number | null;
  maxUsers: number;
  memberCount: number;
  canAccessApp: boolean;
}

export interface PlanOption extends PlanConfig {
  isCurrent: boolean;
}

export * from './validation';
export * from './pii';
export * from './agenda';
export * from './ai-redaction';
export * from './ai-credits';
