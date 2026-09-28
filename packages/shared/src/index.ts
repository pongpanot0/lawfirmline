export * from './task-operations';

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

/** Higher number = higher authority. Used for "assign only to roles below yours". */
export const FIRM_ROLE_RANK: Record<FirmRole, number> = {
  [FirmRole.OWNER]: 3,
  [FirmRole.SENIOR_LAWYER]: 2,
  [FirmRole.LAWYER]: 1,
  [FirmRole.ASSISTANT]: 0,
};

/** May `assigner` hand work to `assignee`? Self always allowed; otherwise only strictly lower roles. */
export function canAssignFirmRole(assigner: FirmRole, assignee: FirmRole): boolean {
  return FIRM_ROLE_RANK[assigner] > FIRM_ROLE_RANK[assignee];
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
  ARCHIVED = 'ARCHIVED',
}

/**
 * ขั้นตอนของคดีในกระบวนพิจารณา — คนละเรื่องกับ {@link CaseStatus} ที่บอกเพียงว่า
 * งานยังเดินอยู่หรือไม่. เรียงตามลำดับที่คดีเดินจริง; `CASE_STAGE_ORDER`
 * ใช้ลำดับนี้วาดแถบความคืบหน้า.
 */
export enum CaseStage {
  INTAKE_REVIEW = 'INTAKE_REVIEW',
  FACT_GATHERING = 'FACT_GATHERING',
  PRE_LITIGATION = 'PRE_LITIGATION',
  FILING = 'FILING',
  ANSWER = 'ANSWER',
  MEDIATION = 'MEDIATION',
  HEARING = 'HEARING',
  AWAITING_JUDGMENT = 'AWAITING_JUDGMENT',
  ENFORCEMENT = 'ENFORCEMENT',
  CLOSING = 'CLOSING',
  APPEAL = 'APPEAL',
  SUPREME = 'SUPREME',
}

export enum CaseOutcome {
  WON = 'WON',
  LOST = 'LOST',
  SETTLED = 'SETTLED',
  /** ไกล่เกลี่ยสำเร็จ (ผ่านศาล/ศูนย์ไกล่เกลี่ย) — แยกจาก SETTLED ที่ตกลงกันเอง */
  MEDIATED = 'MEDIATED',
  WITHDRAWN = 'WITHDRAWN',
  IN_PROGRESS = 'IN_PROGRESS',
}

export const CASE_STAGE_ORDER: CaseStage[] = [
  CaseStage.FACT_GATHERING,
  CaseStage.PRE_LITIGATION,
  CaseStage.FILING,
  CaseStage.ANSWER,
  CaseStage.CLOSING,
  CaseStage.APPEAL,
  CaseStage.SUPREME,
];

/**
 * ขั้นตอนของงานรับเรื่อง — แยกจากผลลัพธ์ (IntakeStatus)
 * เรียงตามลำดับที่งานเดินจริง
 */
export enum IntakeStage {
  NEW_INQUIRY = 'NEW_INQUIRY',
  CONTACTED = 'CONTACTED',
  SCREENING = 'SCREENING',
  CONFLICT_CHECK = 'CONFLICT_CHECK',
  CONSULT_SCHEDULED = 'CONSULT_SCHEDULED',
  CONSULTED = 'CONSULTED',
  WAITING_DOCUMENTS = 'WAITING_DOCUMENTS',
  PRE_LITIGATION_NOTICE = 'PRE_LITIGATION_NOTICE',
  PROPOSAL = 'PROPOSAL',
  CLOSED = 'CLOSED',
}

export const INTAKE_STAGE_ORDER: IntakeStage[] = [
  IntakeStage.NEW_INQUIRY,
  IntakeStage.CONTACTED,
  IntakeStage.SCREENING,
  IntakeStage.CONFLICT_CHECK,
  IntakeStage.CONSULT_SCHEDULED,
  IntakeStage.CONSULTED,
  IntakeStage.WAITING_DOCUMENTS,
  IntakeStage.PRE_LITIGATION_NOTICE,
  IntakeStage.PROPOSAL,
  IntakeStage.CLOSED,
];

export enum DocRequestStatus {
  REQUESTED = 'REQUESTED',
  RECEIVED = 'RECEIVED',
  MISSING = 'MISSING',
  NOT_APPLICABLE = 'NOT_APPLICABLE',
}

/**
 * เอกสารที่คาดว่าต้องมีตามประเภทงานก่อนฟ้อง พร้อมคำใบ้สำหรับจับคู่ชื่อไฟล์
 *
 * ใช้สองที่: ฝั่ง API เอาไป seed `IntakeDocumentRequest` ตอนเปิด checklist
 * ครั้งแรก และฝั่งเว็บเอา `hints` ไปเดาว่าไฟล์ที่อัปโหลดตรงกับช่องไหน
 */
export const PRE_LITIGATION_DOCUMENTS: Record<string, Array<{ label: string; hints: string[] }>> = {
  MEDICAL_CLAIM: [
    { label: 'กรมธรรม์ประกันภัย', hints: ['กรมธรรม์', 'policy', 'insurance'] },
    { label: 'แบบฟอร์มเรียกร้องค่าสินไหม', hints: ['สินไหม', 'claim form', 'claim'] },
    { label: 'เวชระเบียน', hints: ['เวชระเบียน', 'medical record', 'record'] },
    { label: 'Peer review / ความเห็นแพทย์ผู้ทบทวน', hints: ['peer review', 'review', 'ความเห็นแพทย์'] },
    { label: 'เอกสารสรุปโดยย่อเหตุการณ์', hints: ['สรุป', 'summary', 'เหตุการณ์', 'incident'] },
  ],
  TRANSPORT: [
    { label: 'เอกสารรับขน / ใบตราส่ง', hints: ['ใบตราส่ง', 'bill of lading', 'waybill'] },
    { label: 'หลักฐานความเสียหายหรือสูญหาย', hints: ['เสียหาย', 'damage', 'สูญหาย', 'loss'] },
    { label: 'สรุปเหตุการณ์และมูลค่าความเสียหาย', hints: ['สรุป', 'summary', 'เหตุการณ์', 'damage'] },
  ],
  GENERAL: [
    { label: 'เอกสารแสดงสิทธิหรือสัญญา', hints: ['สัญญา', 'contract', 'agreement'] },
    { label: 'หลักฐานความเสียหาย', hints: ['เสียหาย', 'damage'] },
    { label: 'สรุปโดยย่อเหตุการณ์', hints: ['สรุป', 'summary', 'เหตุการณ์'] },
  ],
};

export function preLitigationDocuments(preLitigationType: string | null | undefined) {
  return PRE_LITIGATION_DOCUMENTS[preLitigationType ?? 'GENERAL'] ?? PRE_LITIGATION_DOCUMENTS.GENERAL;
}

/** คำใบ้ของ label ที่มาจาก template — รายการที่ทนายพิมพ์เองไม่มีคำใบ้ */
export function documentHintsFor(label: string): string[] {
  for (const items of Object.values(PRE_LITIGATION_DOCUMENTS)) {
    const found = items.find((item) => item.label === label);
    if (found) return found.hints;
  }
  return [];
}

/** เอกสารที่สำนักงานขอบ่อยที่สุด — ใช้เป็นปุ่มเติม checklist เร็ว ไม่ใช่ข้อบังคับ */
export const COMMON_INTAKE_DOCUMENTS = [
  'สำเนาบัตรประชาชน',
  'สำเนาทะเบียนบ้าน',
  'สัญญา / เอกสารข้อตกลง',
  'ใบเสร็จ / หลักฐานการชำระเงิน',
  'เวชระเบียน / ใบรับรองแพทย์',
  'หนังสือโต้ตอบ',
  'ภาพถ่าย',
  'หลักฐานการสนทนา (LINE / แชท)',
  'หนังสือมอบอำนาจ',
] as const;

export enum DocumentCategory {
  PLEADING = 'PLEADING',
  EVIDENCE = 'EVIDENCE',
  CONTRACT = 'CONTRACT',
  CORRESPONDENCE = 'CORRESPONDENCE',
  COURT_ORDER = 'COURT_ORDER',
  IDENTITY = 'IDENTITY',
  MEDICAL = 'MEDICAL',
  FINANCIAL = 'FINANCIAL',
  INTERNAL = 'INTERNAL',
  OTHER = 'OTHER',
}

export enum ConflictResult {
  CLEAR = 'CLEAR',
  POTENTIAL_CONFLICT = 'POTENTIAL_CONFLICT',
  CONFLICT = 'CONFLICT',
  NEEDS_REVIEW = 'NEEDS_REVIEW',
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

export enum TaskPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  [TaskPriority.HIGH]: 'สูง',
  [TaskPriority.MEDIUM]: 'กลาง',
  [TaskPriority.LOW]: 'ต่ำ',
};

export const TASK_LABEL_MAX_COUNT = 10;
export const TASK_LABEL_MAX_LENGTH = 30;

/**
 * Labels are free text typed by lawyers; this is the one place their shape is
 * decided so the API and the chip input agree. Throws with a stable code so
 * callers can map it to their own error copy.
 */
export function normalizeTaskLabels(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== 'string') continue;
    const label = raw.trim();
    if (!label || seen.has(label)) continue;
    if (label.length > TASK_LABEL_MAX_LENGTH) throw new Error('TASK_LABEL_TOO_LONG');
    seen.add(label);
    out.push(label);
  }
  if (out.length > TASK_LABEL_MAX_COUNT) throw new Error('TASK_LABELS_TOO_MANY');
  return out;
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
  /** ลงให้อัตโนมัติเมื่อสถานะ/ขั้นตอน/ผู้รับผิดชอบ/เอกสารเปลี่ยน — ไม่ใช่สิ่งที่คนกรอกเอง */
  STATUS_CHANGE = 'STATUS_CHANGE',
  STAGE_CHANGE = 'STAGE_CHANGE',
  ASSIGNMENT = 'ASSIGNMENT',
  DOCUMENT = 'DOCUMENT',
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
  JOINT_PLAINTIFF = 'JOINT_PLAINTIFF',
  DEFENDANT = 'DEFENDANT',
  JOINT_DEFENDANT = 'JOINT_DEFENDANT',
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

/** Thai court catalog (COJ structure as of 1 เม.ย. 2568 + ศาลปกครอง). Sources: docs/research/2026-09-28-default-courts-and-playbooks.md */
export const DEFAULT_THAI_COURTS = [
  // ศาลสูง
  'ศาลฎีกา',
  'ศาลอุทธรณ์',
  'ศาลอุทธรณ์ภาค 1',
  'ศาลอุทธรณ์ภาค 2',
  'ศาลอุทธรณ์ภาค 3',
  'ศาลอุทธรณ์ภาค 4',
  'ศาลอุทธรณ์ภาค 5',
  'ศาลอุทธรณ์ภาค 6',
  'ศาลอุทธรณ์ภาค 7',
  'ศาลอุทธรณ์ภาค 8',
  'ศาลอุทธรณ์ภาค 9',
  'ศาลอุทธรณ์คดีชำนัญพิเศษ',
  'ศาลรัฐธรรมนูญ',

  // กรุงเทพฯ
  'ศาลแพ่ง',
  'ศาลแพ่งกรุงเทพใต้',
  'ศาลแพ่งธนบุรี',
  'ศาลแพ่งตลิ่งชัน',
  'ศาลแพ่งพระโขนง',
  'ศาลแพ่งมีนบุรี',
  'ศาลอาญา',
  'ศาลอาญากรุงเทพใต้',
  'ศาลอาญาธนบุรี',
  'ศาลอาญาตลิ่งชัน',
  'ศาลอาญาพระโขนง',
  'ศาลอาญามีนบุรี',
  'ศาลแขวงปทุมวัน',
  'ศาลแขวงพระนครใต้',
  'ศาลแขวงพระนครเหนือ',
  'ศาลแขวงดุสิต',
  'ศาลแขวงธนบุรี',
  'ศาลแขวงดอนเมือง',
  'ศาลแขวงบางบอน',
  'ศาลแพ่งมีนบุรีและศาลอาญามีนบุรีแผนกคดีเยาวชนและครอบครัว',

  // ศาลชำนัญพิเศษ
  'ศาลอาญาคดีทุจริตและประพฤติมิชอบกลาง',
  'ศาลอาญาคดีทุจริตและประพฤติมิชอบภาค 1',
  'ศาลอาญาคดีทุจริตและประพฤติมิชอบภาค 2',
  'ศาลอาญาคดีทุจริตและประพฤติมิชอบภาค 3',
  'ศาลอาญาคดีทุจริตและประพฤติมิชอบภาค 4',
  'ศาลอาญาคดีทุจริตและประพฤติมิชอบภาค 5',
  'ศาลอาญาคดีทุจริตและประพฤติมิชอบภาค 6',
  'ศาลอาญาคดีทุจริตและประพฤติมิชอบภาค 7',
  'ศาลอาญาคดีทุจริตและประพฤติมิชอบภาค 8',
  'ศาลอาญาคดีทุจริตและประพฤติมิชอบภาค 9',
  'ศาลแรงงานกลาง',
  'ศาลแรงงานภาค 1',
  'ศาลแรงงานภาค 1 สาขาพระนครศรีอยุธยา',
  'ศาลแรงงานภาค 2',
  'ศาลแรงงานภาค 2 สาขาระยอง',
  'ศาลแรงงานภาค 3',
  'ศาลแรงงานภาค 4',
  'ศาลแรงงานภาค 5',
  'ศาลแรงงานภาค 6',
  'ศาลแรงงานภาค 7',
  'ศาลแรงงานภาค 8',
  'ศาลแรงงานภาค 9',
  'ศาลภาษีอากรกลาง',
  'ศาลล้มละลายกลาง',
  'ศาลทรัพย์สินทางปัญญาและการค้าระหว่างประเทศกลาง',
  'ศาลเยาวชนและครอบครัวกลาง',

  // ภาค 1
  'ศาลจังหวัดพระนครศรีอยุธยา',
  'ศาลจังหวัดลพบุรี',
  'ศาลจังหวัดชัยนาท',
  'ศาลจังหวัดสิงห์บุรี',
  'ศาลจังหวัดอ่างทอง',
  'ศาลจังหวัดสระบุรี',
  'ศาลจังหวัดปทุมธานี',
  'ศาลจังหวัดธัญบุรี',
  'ศาลจังหวัดนนทบุรี',
  'ศาลจังหวัดสมุทรปราการ',
  'ศาลจังหวัดชัยบาดาล',
  'ศาลจังหวัดพระประแดง',
  'ศาลแขวงพระนครศรีอยุธยา',
  'ศาลแขวงลพบุรี',
  'ศาลแขวงนนทบุรี',
  'ศาลแขวงสมุทรปราการ',
  'ศาลแขวงสระบุรี',
  'ศาลเยาวชนและครอบครัวจังหวัดนนทบุรี',
  'ศาลเยาวชนและครอบครัวจังหวัดสมุทรปราการ',
  'ศาลเยาวชนและครอบครัวจังหวัดพระนครศรีอยุธยา',
  'ศาลเยาวชนและครอบครัวจังหวัดปทุมธานี',
  'ศาลเยาวชนและครอบครัวจังหวัดสระบุรี',
  'ศาลเยาวชนและครอบครัวจังหวัดสิงห์บุรี',
  'ศาลเยาวชนและครอบครัวจังหวัดอ่างทอง',
  'ศาลเยาวชนและครอบครัวจังหวัดลพบุรี',
  'ศาลเยาวชนและครอบครัวจังหวัดชัยนาท',

  // ภาค 2
  'ศาลจังหวัดชลบุรี',
  'ศาลจังหวัดฉะเชิงเทรา',
  'ศาลจังหวัดนครนายก',
  'ศาลจังหวัดปราจีนบุรี',
  'ศาลจังหวัดกบินทร์บุรี',
  'ศาลจังหวัดสระแก้ว',
  'ศาลจังหวัดระยอง',
  'ศาลจังหวัดตราด',
  'ศาลจังหวัดจันทบุรี',
  'ศาลจังหวัดพัทยา',
  'ศาลแขวงชลบุรี',
  'ศาลแขวงพัทยา',
  'ศาลแขวงระยอง',
  'ศาลเยาวชนและครอบครัวจังหวัดระยอง',
  'ศาลเยาวชนและครอบครัวจังหวัดชลบุรี',
  'ศาลเยาวชนและครอบครัวจังหวัดจันทบุรี',
  'ศาลเยาวชนและครอบครัวจังหวัดฉะเชิงเทรา',
  'ศาลเยาวชนและครอบครัวจังหวัดตราด',
  'ศาลเยาวชนและครอบครัวจังหวัดสระแก้ว',
  'ศาลเยาวชนและครอบครัวจังหวัดปราจีนบุรี',
  'ศาลเยาวชนและครอบครัวจังหวัดนครนายก',

  // ภาค 3
  'ศาลจังหวัดนครราชสีมา',
  'ศาลจังหวัดบัวใหญ่',
  'ศาลจังหวัดสีคิ้ว',
  'ศาลจังหวัดสีคิ้ว สาขาปากช่อง',
  'ศาลจังหวัดพิมาย',
  'ศาลจังหวัดชัยภูมิ',
  'ศาลจังหวัดภูเขียว',
  'ศาลจังหวัดบุรีรัมย์',
  'ศาลจังหวัดนางรอง',
  'ศาลจังหวัดสุรินทร์',
  'ศาลจังหวัดรัตนบุรี',
  'ศาลจังหวัดศรีสะเกษ',
  'ศาลจังหวัดอุบลราชธานี',
  'ศาลจังหวัดอำนาจเจริญ',
  'ศาลจังหวัดยโสธร',
  'ศาลจังหวัดเดชอุดม',
  'ศาลจังหวัดกันทรลักษ์',
  'ศาลแขวงนครราชสีมา',
  'ศาลแขวงสุรินทร์',
  'ศาลแขวงอุบลราชธานี',
  'ศาลเยาวชนและครอบครัวจังหวัดนครราชสีมา',
  'ศาลเยาวชนและครอบครัวจังหวัดอุบลราชธานี',
  'ศาลเยาวชนและครอบครัวจังหวัดอำนาจเจริญ',
  'ศาลเยาวชนและครอบครัวจังหวัดบุรีรัมย์',
  'ศาลเยาวชนและครอบครัวจังหวัดศรีสะเกษ',
  'ศาลเยาวชนและครอบครัวจังหวัดสุรินทร์',
  'ศาลเยาวชนและครอบครัวจังหวัดชัยภูมิ',
  'ศาลเยาวชนและครอบครัวจังหวัดยโสธร',

  // ภาค 4
  'ศาลจังหวัดขอนแก่น',
  'ศาลจังหวัดพล',
  'ศาลจังหวัดชุมแพ',
  'ศาลจังหวัดอุดรธานี',
  'ศาลจังหวัดหนองคาย',
  'ศาลจังหวัดบึงกาฬ',
  'ศาลจังหวัดเลย',
  'ศาลจังหวัดสกลนคร',
  'ศาลจังหวัดสว่างแดนดิน',
  'ศาลจังหวัดนครพนม',
  'ศาลจังหวัดมุกดาหาร',
  'ศาลจังหวัดมหาสารคาม',
  'ศาลจังหวัดมหาสารคาม สาขาพยัคฆภูมิพิสัย',
  'ศาลจังหวัดร้อยเอ็ด',
  'ศาลจังหวัดร้อยเอ็ด สาขาสุวรรณภูมิ',
  'ศาลจังหวัดหนองบัวลำภู',
  'ศาลจังหวัดกาฬสินธุ์',
  'ศาลแขวงขอนแก่น',
  'ศาลแขวงอุดรธานี',
  'ศาลแขวงพยัคฆภูมิพิสัย',
  'ศาลแขวงสุวรรณภูมิ',
  'ศาลเยาวชนและครอบครัวจังหวัดขอนแก่น',
  'ศาลเยาวชนและครอบครัวจังหวัดอุดรธานี',
  'ศาลเยาวชนและครอบครัวจังหวัดร้อยเอ็ด',
  'ศาลเยาวชนและครอบครัวจังหวัดนครพนม',
  'ศาลเยาวชนและครอบครัวจังหวัดหนองบัวลำภู',
  'ศาลเยาวชนและครอบครัวจังหวัดกาฬสินธุ์',
  'ศาลเยาวชนและครอบครัวจังหวัดหนองคาย',
  'ศาลเยาวชนและครอบครัวจังหวัดเลย',
  'ศาลเยาวชนและครอบครัวจังหวัดสกลนคร',
  'ศาลเยาวชนและครอบครัวจังหวัดมุกดาหาร',
  'ศาลเยาวชนและครอบครัวจังหวัดมหาสารคาม',
  'ศาลเยาวชนและครอบครัวจังหวัดบึงกาฬ',

  // ภาค 5
  'ศาลจังหวัดเชียงใหม่',
  'ศาลจังหวัดฝาง',
  'ศาลจังหวัดฮอด',
  'ศาลจังหวัดลำปาง',
  'ศาลจังหวัดลำพูน',
  'ศาลจังหวัดแม่ฮ่องสอน',
  'ศาลจังหวัดแม่ฮ่องสอน สาขาปาย',
  'ศาลจังหวัดแม่สะเรียง',
  'ศาลจังหวัดเชียงราย',
  'ศาลจังหวัดเชียงราย สาขาเวียงป่าเป้า',
  'ศาลจังหวัดเทิง',
  'ศาลจังหวัดพะเยา',
  'ศาลจังหวัดเชียงคำ',
  'ศาลจังหวัดน่าน',
  'ศาลจังหวัดน่าน สาขาปัว',
  'ศาลจังหวัดแพร่',
  'ศาลแขวงเชียงใหม่',
  'ศาลแขวงเชียงดาว',
  'ศาลแขวงลำปาง',
  'ศาลแขวงเชียงราย',
  'ศาลแขวงเวียงป่าเป้า',
  'ศาลเยาวชนและครอบครัวจังหวัดเชียงใหม่',
  'ศาลเยาวชนและครอบครัวจังหวัดลำปาง',
  'ศาลเยาวชนและครอบครัวจังหวัดลำพูน',
  'ศาลเยาวชนและครอบครัวจังหวัดเชียงราย',
  'ศาลเยาวชนและครอบครัวจังหวัดแพร่',
  'ศาลเยาวชนและครอบครัวจังหวัดน่าน',
  'ศาลเยาวชนและครอบครัวจังหวัดพะเยา',
  'ศาลเยาวชนและครอบครัวจังหวัดแม่ฮ่องสอน',

  // ภาค 6
  'ศาลจังหวัดพิษณุโลก',
  'ศาลจังหวัดพิษณุโลก สาขานครไทย',
  'ศาลจังหวัดสุโขทัย',
  'ศาลจังหวัดสวรรคโลก',
  'ศาลจังหวัดอุตรดิตถ์',
  'ศาลจังหวัดตาก',
  'ศาลจังหวัดแม่สอด',
  'ศาลจังหวัดกำแพงเพชร',
  'ศาลจังหวัดพิจิตร',
  'ศาลจังหวัดเพชรบูรณ์',
  'ศาลจังหวัดหล่มสัก',
  'ศาลจังหวัดวิเชียรบุรี',
  'ศาลจังหวัดนครสวรรค์',
  'ศาลจังหวัดอุทัยธานี',
  'ศาลแขวงพิษณุโลก',
  'ศาลแขวงนครไทย',
  'ศาลแขวงนครสวรรค์',
  'ศาลเยาวชนและครอบครัวจังหวัดนครสวรรค์',
  'ศาลเยาวชนและครอบครัวจังหวัดพิษณุโลก',
  'ศาลเยาวชนและครอบครัวจังหวัดเพชรบูรณ์',
  'ศาลเยาวชนและครอบครัวจังหวัดสุโขทัย',
  'ศาลเยาวชนและครอบครัวจังหวัดกำแพงเพชร',
  'ศาลเยาวชนและครอบครัวจังหวัดอุตรดิตถ์',
  'ศาลเยาวชนและครอบครัวจังหวัดอุทัยธานี',
  'ศาลเยาวชนและครอบครัวจังหวัดพิจิตร',
  'ศาลเยาวชนและครอบครัวจังหวัดตาก',

  // ภาค 7
  'ศาลจังหวัดนครปฐม',
  'ศาลจังหวัดราชบุรี',
  'ศาลจังหวัดสุพรรณบุรี',
  'ศาลจังหวัดกาญจนบุรี',
  'ศาลจังหวัดทองผาภูมิ',
  'ศาลจังหวัดเพชรบุรี',
  'ศาลจังหวัดประจวบคีรีขันธ์',
  'ศาลจังหวัดหัวหิน',
  'ศาลจังหวัดสมุทรสาคร',
  'ศาลจังหวัดสมุทรสงคราม',
  'ศาลแขวงนครปฐม',
  'ศาลแขวงราชบุรี',
  'ศาลแขวงสุพรรณบุรี',
  'ศาลเยาวชนและครอบครัวจังหวัดนครปฐม',
  'ศาลเยาวชนและครอบครัวจังหวัดสุพรรณบุรี',
  'ศาลเยาวชนและครอบครัวจังหวัดราชบุรี',
  'ศาลเยาวชนและครอบครัวจังหวัดกาญจนบุรี',
  'ศาลเยาวชนและครอบครัวจังหวัดเพชรบุรี',
  'ศาลเยาวชนและครอบครัวจังหวัดสมุทรสาคร',
  'ศาลเยาวชนและครอบครัวจังหวัดสมุทรสงคราม',
  'ศาลเยาวชนและครอบครัวจังหวัดประจวบคีรีขันธ์',

  // ภาค 8
  'ศาลจังหวัดนครศรีธรรมราช',
  'ศาลจังหวัดปากพนัง',
  'ศาลจังหวัดทุ่งสง',
  'ศาลจังหวัดชุมพร',
  'ศาลจังหวัดหลังสวน',
  'ศาลจังหวัดสุราษฎร์ธานี',
  'ศาลจังหวัดไชยา',
  'ศาลจังหวัดเกาะสมุย',
  'ศาลจังหวัดเวียงสระ',
  'ศาลจังหวัดระนอง',
  'ศาลจังหวัดกระบี่',
  'ศาลจังหวัดพังงา',
  'ศาลจังหวัดตะกั่วป่า',
  'ศาลจังหวัดภูเก็ต',
  'ศาลแขวงสุราษฎร์ธานี',
  'ศาลแขวงนครศรีธรรมราช',
  'ศาลแขวงทุ่งสง',
  'ศาลแขวงภูเก็ต',
  'ศาลแขวงกระบี่',
  'ศาลเยาวชนและครอบครัวจังหวัดสุราษฎร์ธานี',
  'ศาลเยาวชนและครอบครัวจังหวัดนครศรีธรรมราช',
  'ศาลเยาวชนและครอบครัวจังหวัดภูเก็ต',
  'ศาลเยาวชนและครอบครัวจังหวัดระนอง',
  'ศาลเยาวชนและครอบครัวจังหวัดพังงา',
  'ศาลเยาวชนและครอบครัวจังหวัดชุมพร',
  'ศาลเยาวชนและครอบครัวจังหวัดกระบี่',

  // ภาค 9
  'ศาลจังหวัดสงขลา',
  'ศาลจังหวัดนาทวี',
  'ศาลจังหวัดตรัง',
  'ศาลจังหวัดพัทลุง',
  'ศาลจังหวัดสตูล',
  'ศาลจังหวัดปัตตานี',
  'ศาลจังหวัดยะลา',
  'ศาลจังหวัดเบตง',
  'ศาลจังหวัดนราธิวาส',
  'ศาลแขวงสงขลา',
  'ศาลแขวงตรัง',
  'ศาลเยาวชนและครอบครัวจังหวัดสงขลา',
  'ศาลเยาวชนและครอบครัวจังหวัดตรัง',
  'ศาลเยาวชนและครอบครัวจังหวัดนราธิวาส',
  'ศาลเยาวชนและครอบครัวจังหวัดปัตตานี',
  'ศาลเยาวชนและครอบครัวจังหวัดสตูล',
  'ศาลเยาวชนและครอบครัวจังหวัดยะลา',
  'ศาลเยาวชนและครอบครัวจังหวัดพัทลุง',

  // ศาลปกครอง
  'ศาลปกครองสูงสุด',
  'ศาลปกครองกลาง',
  'ศาลปกครองเชียงใหม่',
  'ศาลปกครองสงขลา',
  'ศาลปกครองนครราชสีมา',
  'ศาลปกครองขอนแก่น',
  'ศาลปกครองพิษณุโลก',
  'ศาลปกครองระยอง',
  'ศาลปกครองนครศรีธรรมราช',
  'ศาลปกครองอุดรธานี',
  'ศาลปกครองอุบลราชธานี',
  'ศาลปกครองเพชรบุรี',
  'ศาลปกครองนครสวรรค์',
  'ศาลปกครองสุพรรณบุรี',
  'ศาลปกครองภูเก็ต',
  'ศาลปกครองยะลา',
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
    name: 'คดีความ',
    description: 'คดีความ / ฟ้องร้อง',
    // The claimed amount is a core case field (ทุนทรัพย์), not a type-specific one.
    fieldSchema: [
      { key: 'opposingParty', label: 'Opposing Party / คู่ความ', type: 'text' },
    ],
  },
  {
    name: 'คดีบริษัท',
    description: 'นิติกรรม / บริษัท',
  },
  {
    name: 'คดีครอบครัว',
    description: 'ครอบครัว / มรดก',
  },
  {
    name: 'คดีอาญา',
    description: 'คดีอาญา',
    fieldSchema: [
      { key: 'chargeSection', label: 'Charge Section / ข้อหา', type: 'text', required: true },
      { key: 'prosecutor', label: 'Prosecutor / อัยการ', type: 'text' },
    ],
  },
  {
    name: 'ทรัพย์สินทางปัญญา',
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
  mfaEnabled: boolean;
  /** @deprecated use firmRole */
  role?: Role;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

/** Returned from POST /auth/login instead of LoginResponse when the account has email MFA on. */
export interface MfaChallengeResponse {
  mfaRequired: true;
  mfaToken: string;
}

export type LoginResult = LoginResponse | MfaChallengeResponse;

/** One active refresh-token session, as shown in Settings → Security → Sessions. */
export interface SessionInfo {
  id: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
  lastUsedAt: string;
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
export * from './analysis-quality';
export * from './cargo-claim';
export * from './default-playbooks';
