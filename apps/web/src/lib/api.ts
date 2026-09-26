import { withFirmSlugHeaders } from './firm-slug';
import { taskUpdatePath } from './task-detail';
import { actionSuccessMessage, isActionRequest, publishActionFeedback } from './action-feedback';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const TOKEN_KEY = 'lawfirm_access_token';
const REFRESH_KEY = 'lawfirm_refresh_token';

function parseApiErrorMessage(body: unknown, fallback: string): string {
  const payload = body as { message?: string | { message?: string } };
  if (typeof payload.message === 'string') return payload.message;
  if (payload.message?.message) return payload.message.message;
  return fallback;
}

function clearSession() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  window.dispatchEvent(new Event('auth:session-expired'));
}

async function refreshAccessToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  const refreshToken = localStorage.getItem(REFRESH_KEY);
  if (!refreshToken) return null;

  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: withFirmSlugHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ refreshToken }),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { accessToken: string };
    localStorage.setItem(TOKEN_KEY, data.accessToken);
    window.dispatchEvent(
      new CustomEvent('auth:token-refreshed', { detail: { accessToken: data.accessToken } }),
    );
    return data.accessToken;
  } catch {
    return null;
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(
  path: string,
  options: RequestInit & { token?: string; refreshAuth?: boolean; silent?: boolean } = {},
): Promise<T> {
  const { token, refreshAuth = true, silent = false, ...fetchOptions } = options;
  const method = (fetchOptions.method ?? 'GET').toUpperCase();
  const isAction = isActionRequest(method) && !silent;
  const isFormData = fetchOptions.body instanceof FormData;
  const headers: HeadersInit = withFirmSlugHeaders({
    ...(!isFormData ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers as Record<string, string> | undefined),
  });
  const authToken = token ?? (typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null);
  if (authToken) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${authToken}`;
  }

  let res = await fetch(`${API_URL}${path}`, {
    ...fetchOptions,
    headers,
    cache: 'no-store',
  });

  if (res.status === 401 && authToken && refreshAuth) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      (headers as Record<string, string>)['Authorization'] = `Bearer ${newToken}`;
      res = await fetch(`${API_URL}${path}`, {
        ...fetchOptions,
        headers,
        cache: 'no-store',
      });
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (res.status === 401 && refreshAuth) clearSession();
    const message = parseApiErrorMessage(body, res.statusText);
    if (isAction) publishActionFeedback('error', `ทำรายการไม่สำเร็จ: ${message}`);
    throw new ApiError(res.status, message);
  }

  if (isAction) publishActionFeedback('success', actionSuccessMessage(method));

  if (res.status === 204) return undefined as T;
  if (res.headers.get('content-length') === '0') return null as T;
  return res.json();
}

async function fetchBlob(
  path: string,
  options: RequestInit & { token?: string } = {},
): Promise<Blob> {
  const { token, ...fetchOptions } = options;
  const headers: HeadersInit = withFirmSlugHeaders({
    ...(options.headers as Record<string, string> | undefined),
  });
  const authToken = token ?? (typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null);
  if (authToken) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${authToken}`;
  }

  let res = await fetch(`${API_URL}${path}`, {
    ...fetchOptions,
    headers,
    cache: 'no-store',
  });

  if (res.status === 401 && authToken) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      (headers as Record<string, string>)['Authorization'] = `Bearer ${newToken}`;
      res = await fetch(`${API_URL}${path}`, {
        ...fetchOptions,
        headers,
        cache: 'no-store',
      });
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (res.status === 401) clearSession();
    throw new ApiError(res.status, parseApiErrorMessage(body, res.statusText));
  }

  return res.blob();
}

export interface UserItem {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: import('@lawfirm/shared').Role;
  /** Role within the current firm; null when the membership row is missing. */
  firmRole?: import('@lawfirm/shared').FirmRole | null;
}

export interface WorkloadSummary {
  userId: string;
  firstName: string;
  lastName: string;
  leadCount: number;
  buddyCount: number;
  nearDeadlineCount: number;
  /** Case count weighted by claimed amount (ทุนทรัพย์); lead 1x, buddy 0.5x. */
  weightedScore: number;
  claimedTotal: number;
  capacity: 'LOW' | 'NORMAL' | 'HIGH' | 'OVERLOADED';
}

export interface CaseHealthCaseItem {
  id: string;
  title: string;
  status: string;
  openedAt: string;
  inStatusSince?: string;
  leadLawyer: { id: string; firstName: string; lastName: string };
}

export interface CaseHealth {
  sla: SlaConfig;
  byStatus: Array<{ status: string; count: number }>;
  inactiveCases: CaseHealthCaseItem[];
  stuckCases: CaseHealthCaseItem[];
}

export interface SlaConfig {
  caseUpdateDays: number;
  stuckStatusDays: number;
  reviewDays: number;
}

export interface TeamPerformanceRow {
  userId: string;
  firstName: string;
  lastName: string;
  completedCount: number;
  avgTurnaroundDays: number | null;
  turnaroundSampleCount: number;
  openCount: number;
  overdueCount: number;
  overdueRate: number;
}

export interface WorkflowMetrics {
  days: number;
  intakeToCase: { averageDays: number | null; sampleCount: number };
  documentTurnaround: { averageDays: number | null; sampleCount: number };
  hearingCloseout: { averageDays: number | null; sampleCount: number };
  openDocumentRequests: number;
  overdueDocumentRequests: number;
}

export interface OwnerKpis {
  month: string;
  unbilled: { amount: number; caseCount: number };
  collectionRate: { value: number | null; target: 0.95; billed: number; collected: number };
  avgDaysOutstanding: number | null;
  revenue: { month: number; previousMonth: number };
  byLawyer: Array<{
    userId: string;
    name: string;
    openCases: number;
    billed: number;
    collected: number;
    rate: number | null;
  }>;
  stuckByStage: Array<{ stage: string; count: number; oldestDays: number }>;
}

export interface SopItem {
  id: string;
  title: string;
  content: string;
  category: string | null;
  updatedAt: string;
  updatedBy: { firstName: string; lastName: string };
}

export interface WorkloadCaseItem {
  caseId: string;
  title: string;
  status: string;
  role: 'LEAD' | 'BUDDY';
  nearestDeadlineDays: number | null;
}

export interface WorkloadDetail {
  userId: string;
  firstName: string;
  lastName: string;
  cases: WorkloadCaseItem[];
}

/** ทีมที่ทำคดีร่วมกัน — สองคนขึ้นไป ไม่จำกัดแค่คู่ */
export interface PairingEntry {
  key: string;
  members: { id: string; name: string }[];
  count: number;
}

export interface OnHoldTaskEntry {
  taskId: string;
  taskTitle: string;
  caseId: string | null;
  caseTitle: string | null;
  caseOwnRef: string | null;
  assigneeName: string | null;
  reason: string;
  category: 'WAITING_CLIENT' | 'WAITING_COURT' | 'WAITING_DOCUMENT' | 'WAITING_INTERNAL_REVIEW' | 'WAITING_EXTERNAL' | 'OTHER';
  startedAt: string;
  followerName: string | null;
  lastFollowUpAt: string | null;
  nextFollowUpAt: string | null;
  dueDate: string | null;
  isOverdue: boolean;
}

export interface CalendarEventItem {
  id: string;
  title: string;
  description?: string | null;
  courtName?: string | null;
  startAt: string;
  endAt?: string | null;
  type: string;
  assigneeId?: string | null;
  leaveId?: string;
  leaveType?: 'SICK' | 'PERSONAL' | 'VACATION';
  leaveOwnerId?: string;
  leaveStartDate?: string;
  leaveEndDate?: string;
  case?: { id: string; ownRef: string; title: string; courtName?: string | null; leadLawyer?: { id: string; firstName: string; lastName: string } };
}

export interface LeaveCourtConflict {
  eventId: string;
  caseId: string;
  caseRef: string | null;
  title: string;
  courtName: string | null;
  startAt: string;
}

export interface LeaveItem {
  id: string;
  userId: string;
  type: 'SICK' | 'PERSONAL' | 'VACATION';
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  startDate: string;
  endDate: string;
  decidedAt: string | null;
  user: { firstName: string; lastName: string };
  courtConflicts?: LeaveCourtConflict[];
}

/** ลูกค้า = ผู้ว่าจ้าง/ผู้จ่ายเงิน ต่างจากลูกความ (client) ที่เราว่าความให้ */
export interface CustomerShareItem {
  id: string;
  customerId: string;
  sharePercent?: number | null;
  isPrimary: boolean;
  note?: string | null;
  customer: { id: string; name: string };
  /** คนติดต่อฝั่งลูกค้ารายนี้ — ใครคือคนที่คุยกับเรา */
  contactId?: string | null;
  contact?: { id: string; name: string; phone?: string | null; email?: string | null } | null;
}

export interface AdditionalClientItem {
  id: string;
  clientId: string;
  note?: string | null;
  client: { id: string; name: string };
}

export interface CaseItem {
  id: string;
  ownRef: string;
  customerRef?: string | null;
  folderId?: string;
  title: string;
  description?: string | null;
  status: import('@lawfirm/shared').CaseStatus;
  /** ขั้นตอนในกระบวนพิจารณา — แยกจาก status */
  stage?: import('@lawfirm/shared').CaseStage;
  stageChangedAt?: string;
  outcome?: import('@lawfirm/shared').CaseOutcome;
  clientId?: string | null;
  clientName?: string | null;
  /** ฝ่ายเรา — โจทก์ (PLAINTIFF) หรือจำเลย (DEFENDANT) */
  partyRole?: 'PLAINTIFF' | 'DEFENDANT' | null;
  courtName?: string | null;
  courtLevel?: import('@lawfirm/shared').CourtLevel | null;
  blackCaseNumber?: string | null;
  redCaseNumber?: string | null;
  customFields?: Record<string, unknown> | null;
  claimedAmount?: number | null;
  estimatedFee?: number | null;
  closingSummary?: string | null;
  closedAt?: string | null;
  updatedAt?: string;
  leadLawyer: { firstName: string; lastName: string };
  caseType?: { id: string; name: string; fieldSchema?: unknown } | null;
  client?: { id: string; name: string } | null;
  customers?: CustomerShareItem[];
  additionalClients?: AdditionalClientItem[];
  participants?: Array<{ name: string; role: string }>;
  cargoClaim?: { id: string } | null;
  intake?: { id: string; status: string } | null;
  relatedIntakes?: Array<{ id: string; status: string }>;
}

export interface CargoDocumentRequirementItem {
  id: string;
  code: string;
  label: string;
  required: boolean;
  status: 'REQUESTED' | 'RECEIVED' | 'MISSING' | 'NOT_APPLICABLE';
  note?: string | null;
  documentId?: string | null;
  document?: { id: string; filename: string } | null;
}

export interface CargoClaimInput {
  assuredName?: string;
  shipperName?: string;
  consigneeName?: string;
  contractingCarrierName?: string;
  actualCarrierName?: string;
  origin?: string;
  destination?: string;
  transportMode?: string;
  transportDocumentNumber?: string;
  arrivalDate?: string | null;
  lossDate?: string | null;
  goodsDescription?: string;
  movementTerm?: string;
  damageDescription?: string;
  damagedWeight?: number | null;
  weightUnit?: string;
  claimAmount?: number | null;
  currency?: string;
  applicableLaw?: string;
  jurisdiction?: string;
  liableParty?: string;
  liabilityLimit?: string;
  liabilityExclusion?: string;
  timeBarPeriod?: string;
  timeBarTriggerDate?: string | null;
  timeBarDeadline?: string | null;
  timeBarBasis?: string;
  quantumNotes?: string;
  recommendation?: string;
  opinion?: string;
  confirm?: boolean;
}

export interface CargoClaimItem extends CargoClaimInput {
  id: string;
  caseId?: string | null;
  intakeId?: string | null;
  reviewStatus: 'DRAFT' | 'CONFIRMED';
  confirmedAt?: string | null;
  confirmedBy?: { id: string; firstName: string; lastName: string } | null;
  playbookReleaseId?: string | null;
  playbookRelease?: { id: string; name: string; version: number; templateKey?: string | null } | null;
  requirements: CargoDocumentRequirementItem[];
}

export interface InsuranceClaimItem {
  id: string;
  caseId: string;
  insurerName: string;
  policyNumber?: string | null;
  claimNumber?: string | null;
  incidentDate: string;
  claimedDate?: string | null;
  denialReason?: string | null;
  stage: import('@lawfirm/shared').InsuranceClaimStage;
  demandLetterSentAt?: string | null;
  demandLetterDeadline?: string | null;
  oicComplaintNumber?: string | null;
  oicComplaintDate?: string | null;
  oicOutcome?: string | null;
  limitationDeadline: string | null;
}

export interface ClientContactItem {
  id?: string;
  name: string;
  nickname?: string | null;
  notes?: string | null;
  email?: string | null;
  phone?: string | null;
  position?: string | null;
  isPrimary?: boolean;
  portalEnabled?: boolean;
}

export interface ClientItem {
  id: string;
  name: string;
  type?: string | null;
  notes?: string | null;
  taxId?: string | null;
  branch?: string | null;
  address?: string | null;
  billingEmail?: string | null;
  billingPhone?: string | null;
  contacts: ClientContactItem[];
  _count?: { cases: number };
  cases?: CaseItem[];
}

export interface CourtItem {
  id: string;
  name: string;
  address?: string | null;
  isActive: boolean;
}

export interface AuditLogItem {
  id: string;
  action: string;
  userId: string | null;
  user: { firstName: string; lastName: string } | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface AuditLogResult {
  items: AuditLogItem[];
  total: number;
}

export interface CaseMessageEntry {
  id: string;
  senderType: 'STAFF' | 'CONTACT';
  senderUserId: string | null;
  senderContactId: string | null;
  body: string;
  /** ไฟล์ที่แนบมากับข้อความ — ลูกความส่งเอกสารเพิ่มเข้ามาได้ */
  filename?: string | null;
  mimeType?: string | null;
  size?: number | null;
  createdAt: string;
}

export interface CaseActivityItem {
  id: string;
  title: string;
  description?: string | null;
  activityAt: string;
  type: import('@lawfirm/shared').ActivityType;
  createdBy: { firstName: string; lastName: string };
}

export interface RequiredDocumentsResult {
  required: Array<{ category: string; present: boolean }>;
  missing: string[];
}

export interface CaseTypeItem {
  id: string;
  name: string;
  description?: string | null;
  fieldSchema?: Array<{ key: string; label: string; type: string; required?: boolean; options?: string[] }> | null;
  isActive: boolean;
  requiredDocuments?: string[] | null;
  _count?: { cases: number };
}

export interface ExpenseItem {
  id: string;
  amount: number;
  description: string;
  category?: string | null;
  expensePurpose?: string | null;
  status: import('@lawfirm/shared').ExpenseStatus;
  date: string;
  paidAt?: string | null;
  claimId?: string | null;
  user: { id: string; firstName: string; lastName: string; role?: string };
  paidBy?: { firstName: string; lastName: string } | null;
  case?: { id: string; ownRef: string; title: string; courtName?: string | null } | null;
  receiptFilename?: string | null;
  /** false = สำนักงานออกเอง ไม่ผลักไปเก็บกับลูกค้า */
  billable?: boolean;
  /** ตั้งแล้วแปลว่าออกใบแจ้งหนี้ไปแล้ว แก้ไม่ได้ */
  invoiceId?: string | null;
  paidFromAdvanceId?: string | null;
  paidFromAdvance?: { id: string; issuedById: string } | null;
}

export interface CashAdvanceItem {
  id: string;
  amount: number;
  remaining: number;
  note?: string | null;
  issuedAt: string;
  issuedById: string;
  userId: string;
  user?: { id: string; firstName: string; lastName: string };
}

export interface ExpenseClaimSummary {
  id: string;
  status: import('@lawfirm/shared').ExpenseClaimStatus | string;
  submittedAt: string;
  reviewedAt?: string | null;
  paidAt?: string | null;
  submittedBy: { id: string; firstName: string; lastName: string };
  totalAmount: number;
  itemCount: number;
  receiptCount: number;
  cases: Array<{ id: string; ownRef: string; title: string }>;
  expenses: ExpenseItem[];
}

export interface CaseParticipantItem {
  id: string;
  caseId: string;
  name: string;
  nickname?: string | null;
  role: string;
  side: string;
  personType?: string | null;
  idNumber?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  opposingLawyer?: string | null;
  opposingInsurer?: string | null;
  medicalLicenseNo?: string | null;
  notes?: string | null;
}

export interface CaseDetail extends CaseItem {
  limitationDeadline?: string | null;
  insuranceClaim?: InsuranceClaimItem | null;
  /** intake ต้นทาง — งานก่อนฟ้อง (โนติส/เจรจา) ยังบันทึกอยู่ที่นั่น */
  intake?: {
    id: string;
    status: string;
    noticeIssuedAt?: string | null;
    noticeDeadline?: string | null;
    noticeRecipient?: string | null;
    noticeResult?: string | null;
    preLitigationStatus?: string | null;
    settlementOfferAmount?: number | null;
  } | null;
  description?: string | null;
  folderId?: string;
  courtName?: string | null;
  customFields?: Record<string, unknown> | null;
  openedAt: string;
  leadLawyer: { id: string; firstName: string; lastName: string; email: string };
  assignments: Array<{
    assignmentType: string;
    user: { id: string; firstName: string; lastName: string; role: string };
  }>;
  tasks: Array<{
    id: string;
    title: string;
    status: string;
    assignee?: { firstName: string; lastName: string } | null;
  }>;
  calendarEvents?: Array<{
    id: string;
    title: string;
    startAt: string;
    type: string;
  }>;
  activities?: CaseActivityItem[];
  participants?: CaseParticipantItem[];
  client?: {
    id: string;
    name: string;
    contacts: ClientContactItem[];
  } | null;
  _count: { tasks: number; documents: number };
}

export interface TaskPerson {
  id: string;
  firstName: string;
  lastName: string;
}

// งานที่ Playbook แนะนำเมื่อเรื่องย้ายเข้าขั้นตอนหนึ่ง
export interface StageTaskProposal {
  title: string;
  description: string;
  dueDate: string | null;
  assigneeId: string | null;
  releaseName: string;
}

export interface StageTaskDraft {
  title: string;
  description?: string;
  dueDate?: string | null;
  assigneeId?: string | null;
}

export interface TaskItem {
  id: string;
  caseId?: string | null;
  case?: { id: string; ownRef: string; title: string; blackCaseNumber?: string | null; redCaseNumber?: string | null } | null;
  parentId?: string | null;
  title: string;
  description?: string | null;
  status: import('@lawfirm/shared').TaskStatus;
  priority: import('@lawfirm/shared').TaskPriority;
  labels: string[];
  dueDate?: string | null;
  recurrenceDays?: number | null;
  blockedById?: string | null;
  createdById?: string;
  assignee?: TaskPerson | null;
  subtaskCount?: number;
  subtaskDoneCount?: number;
  attachmentCount?: number;
  commentCount?: number;
  assignmentLogs?: Array<{
    action: import('@lawfirm/shared').TaskLogAction;
    note?: string | null;
    stageDueDate?: string | null;
    createdAt: string;
    fromUser?: { firstName: string; lastName: string } | null;
    toUser: { firstName: string; lastName: string };
  }>;
}

export interface TaskAttachmentItem {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: string;
  uploadedBy: TaskPerson;
}

export interface TaskCommentItem {
  id: string;
  body: string;
  createdAt: string;
  author: TaskPerson;
}

export interface TaskSubtaskItem {
  id: string;
  title: string;
  status: import('@lawfirm/shared').TaskStatus;
  dueDate?: string | null;
  priority: import('@lawfirm/shared').TaskPriority;
  assignee?: TaskPerson | null;
}

export interface TaskDetail extends TaskItem {
  parent?: { id: string; title: string } | null;
  subtasks: TaskSubtaskItem[];
  attachments: TaskAttachmentItem[];
  comments: TaskCommentItem[];
}

export function caseMessageAttachmentUrl(caseId: string, messageId: string) {
  return `${API_URL}/cases/${caseId}/messages/${messageId}/attachment`;
}

export function taskAttachmentDownloadUrl(taskId: string, attachmentId: string) {
  return `${API_URL}/tasks/${taskId}/attachments/${attachmentId}/download`;
}

export type MyDayResponse = import('@lawfirm/shared').MyDayResponse;
export type AgendaItem = import('@lawfirm/shared').AgendaItem;

export interface NotificationPreferences {
  dailyDigestEnabled: boolean;
  digestChannel: 'line' | 'email';
  digestEmail: string;
}
export type DeadlineRuleItem = import('@lawfirm/shared').DeadlineRuleItem;

export interface PublicHolidayItem {
  id: string;
  date: string;
  name: string;
}

/** A task the signed-in user has picked up and not yet finished. */
export interface ActiveTask {
  id: string;
  title: string;
  status: import('@lawfirm/shared').TaskStatus;
  dueDate: string | null;
  caseId: string | null;
  caseRef: string | null;
  caseTitle: string | null;
  /** Set only while the task is still paused waiting on someone. */
  onHold: { reason: string; nextFollowUpAt: string | null } | null;
}

export interface DashboardStats {
  firmId: string;
  firmName: string;
  role: import('@lawfirm/shared').Role;
  stats: {
    totalCases: number;
    openCases: number;
    upcomingEvents: number;
    overdueTasks: number;
    myTasks: number;
    pendingExpenses: number;
    /** Approved but not yet paid out — kept apart from "awaiting approval". */
    approvedExpenses: number;
    monthlyRevenue: number;
    totalNetProfit: number;
  };
  caseProfits: CaseProfitRow[];
  activeTasks: ActiveTask[];
  recentCases: Array<{
    id: string;
    ownRef: string;
    title: string;
    status: string;
    updatedAt: string;
    leadLawyer: { firstName: string; lastName: string };
  }>;
  upcomingHearings: Array<{
    id: string;
    title: string;
    startAt: string;
    caseId: string;
    case: {
      ownRef: string;
      title: string;
      courtName: string | null;
      clientName: string | null;
      client: { name: string } | null;
    };
  }>;
  pendingReimbursements: ExpenseItem[];
}

export interface ReportsSummary {
  firmId: string;
  firmName: string;
  scope?: 'firm' | 'user';
  kpis: {
    casesClosedYtd: number;
    casesClosedChange: number;
    winRate: number;
    avgCaseDurationMonths: number | null;
  };
  caseVolumeByType: Array<{ label: string; count: number }>;
  revenueByLawyer: Array<{ lawyerName: string; hours: number; revenue: number }>;
  courtAppearancesByMonth: Array<{ month: string; count: number }>;
  expenseSummary: {
    total: number;
    approved: number;
    pending: number;
    byCategory: Array<{ category: string; amount: number }>;
  };
}

export interface CaseProfitRow {
  caseId: string;
  ownRef: string;
  title: string;
  status: string;
  clientName: string | null;
  revenue: number;
  revenueSource: 'estimated' | 'time' | 'invoice' | 'none';
  expenses: number;
  profit: number;
}

export interface FinanceSummary {
  firmId: string;
  firmName: string;
  scope?: 'firm' | 'user';
  revenue: number;
  totalExpenses: number;
  approvedExpenses: number;
  outstanding: number;
  draftTotal?: number;
  netProfit: number;
  caseProfits: CaseProfitRow[];
  pettyCashBalance: number;
  pendingCount: number;
  draftCount?: number;
  expenseCount: number;
}

export interface FirmInvoiceItem {
  id: string;
  caseId?: string | null;
  intakeId?: string | null;
  createdAt?: string;
  customerName?: string;
  subject?: string;
  invoiceNumber: string;
  status: string;
  totalAmount: number;
  issuedAt?: string | null;
  dueAt?: string | null;
  ownRef: string;
  clientName: string;
}

export interface InvoicePaymentItem {
  id: string;
  amount: number;
  method: 'TRANSFER' | 'CHEQUE' | 'CASH' | 'OTHER';
  receivedAt: string;
  note?: string | null;
  recordedById: string;
  createdAt: string;
}

export interface RecordInvoicePaymentInput {
  amount: number;
  method?: 'TRANSFER' | 'CHEQUE' | 'CASH' | 'OTHER';
  receivedAt: string;
  note?: string;
}

export interface RecordInvoicePaymentResult {
  invoice: FirmInvoiceItem;
  payment: InvoicePaymentItem;
  outstanding: number;
}

export interface ReceivablesRow {
  id: string;
  invoiceNumber: string;
  customerName: string | null;
  caseId: string | null;
  caseRef: string | null;
  totalAmount: number;
  paidAmount: number;
  outstanding: number;
  issuedAt: string | null;
  dueAt: string | null;
  daysOverdue: number;
  bucket: '0-30' | '31-60' | '61-90' | '90+';
  lastReminderAt: string | null;
}

export interface ReceivablesResult {
  buckets: { '0-30': number; '31-60': number; '61-90': number; '90+': number };
  rows: ReceivablesRow[];
}

export interface RemindInvoiceResult {
  sent: number;
  linkedContacts: number;
}

export interface IntakeItem {
  id: string;
  receivedDate: string;
  title?: string | null;
  relatedCaseId?: string | null;
  isOngoingElsewhere?: boolean;
  externalCaseNumber?: string | null;
  currentStageNote?: string | null;
  referralType: string;
  referralChannel: string;
  referralName?: string | null;
  clientId?: string | null;
  clientName?: string | null;
  contactName?: string | null;
  customerRef?: string | null;
  matterType?: string | null;
  caseTypeId?: string | null;
  /** ฝ่ายเรา — โจทก์ (PLAINTIFF) หรือจำเลย (DEFENDANT) */
  partyRole?: 'PLAINTIFF' | 'DEFENDANT' | null;
  preferredPlaybookId?: string | null;
  opposingParty?: string | null;
  insurerName?: string | null;
  policyNumber?: string | null;
  claimNumber?: string | null;
  incidentDate?: string | null;
  description?: string | null;
  estimatedDamage?: number | null;
  requestedResponseDate?: string | null;
  assignedUserIds?: string[];
  deadlineDate?: string | null;
  status: string;
  /** ขั้นตอนของงานรับเรื่อง — แยกจาก status ที่บอกผลลัพธ์ */
  stage?: string;
  stageChangedAt?: string;
  statusChangedAt?: string;
  nextFollowUpAt?: string | null;
  followUpOwnerId?: string | null;
  lastFollowUpAt?: string | null;
  /** เติมจากฝั่ง API ในรายการ intake */
  ageDays?: number;
  daysInStatus?: number;
  daysInStage?: number;
  followUpOverdueDays?: number | null;
  documentRequests?: IntakeDocumentRequestItem[];
  followUps?: IntakeFollowUpItem[];
  conflictChecks?: ConflictCheckRecord[];
  decision: string;
  preLitigationType: string;
  preLitigationStatus: string;
  preLitigationNotes?: string | null;
  settlementOfferAmount?: number | null;
  caseStrength?: string | null;
  assessmentNotes?: string | null;
  decisionNotes?: string | null;
  noticeIssuedAt?: string | null;
  noticeRecipient?: string | null;
  noticeDeadline?: string | null;
  noticeResult?: string | null;
  noticeContent?: string | null;
  attachments?: IntakeAttachmentItem[];
  fieldProposals?: IntakeFieldProposalItem[];
  emailThreads?: { id: string; subject: string; fromName: string | null; fromAddress: string | null; lastMessageAt: string }[];
  receivedBy?: { id: string; firstName: string; lastName: string };
  assessor?: { id: string; firstName: string; lastName: string } | null;
  client?: { id: string; name: string } | null;
  customers?: CustomerShareItem[];
  additionalClients?: AdditionalClientItem[];
  case?: { id: string; ownRef: string; title: string } | null;
  relatedCase?: { id: string; ownRef: string; title: string; status: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface IntakeAttachmentItem {
  id: string;
  filename: string;
  mimeType: string;
  createdAt: string;
}

export interface IntakeFieldProposalItem {
  id: string;
  intakeId: string;
  field: string;
  proposedValue: string | null;
  previousValue: string | null;
  sourceType: 'EMAIL_BODY' | 'ATTACHMENT' | 'EXISTING_CLIENT' | 'MANUAL';
  sourceDetail: string | null;
  status: 'SUGGESTED' | 'REQUIRES_CONFIRMATION' | 'CONFIRMED' | 'REJECTED' | 'CONFLICT';
  confirmedById: string | null;
  confirmedAt: string | null;
  createdAt: string;
}

export interface EmailThreadListItem {
  id: string;
  subject: string;
  fromName: string | null;
  fromAddress: string | null;
  lastMessageAt: string;
  status: 'PENDING_INTAKE' | 'LINKED' | 'ARCHIVED';
  messageCount: number;
  attachmentCount: number;
  bodyExcerpt: string;
  linkedIntake: { id: string; status: string } | null;
}

export interface EmailAttachmentItem {
  id: string;
  filename: string;
  mimeType: string;
  createdAt: string;
}

export interface EmailMessageItem {
  id: string;
  direction: 'INBOUND' | 'OUTBOUND';
  fromName: string | null;
  fromAddress: string | null;
  bodyText: string | null;
  receivedAt: string;
  attachments: EmailAttachmentItem[];
}

export interface EmailThreadDetail {
  thread: EmailThreadListItem & { messages: EmailMessageItem[]; intake: { id: string; status: string; title: string | null } | null };
  proposals: IntakeFieldProposalItem[];
}

export interface MailboxConnectionItem {
  id: string;
  mailboxAddress: string;
  connectedByUserId: string;
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'ERROR';
  lastError: string | null;
  lastSyncedAt: string | null;
  subscriptionExpiresAt: string | null;
  createdAt: string;
}

export interface ReviewDecisionItem {
  reviewerId: string;
  decision: 'APPROVED' | 'RETURNED';
  reason: string | null;
  decidedAt: string;
}

export interface ReviewRoundItem {
  id: string;
  documentVersionId: string;
  reviewerIds: string[];
  editorIds: string[];
  approvalRule: 'ALL' | 'ANY_ONE';
  scope: string | null;
  dueAt: string | null;
  status: 'WAITING_REVIEW' | 'RETURNED' | 'APPROVED' | 'CANCELLED';
  createdById: string;
  createdAt: string;
  decisions: ReviewDecisionItem[];
  documentVersion: {
    id: string;
    documentId: string;
    version: number;
    filename: string;
    status: 'DRAFT' | 'WAITING_REVIEW' | 'RETURNED_FOR_CHANGES' | 'APPROVED' | 'SUPERSEDED';
    notes: string | null;
    createdById: string | null;
    createdAt: string;
  };
}

export interface IntakePrecedentItem {
  dekaId: string;
  headnote: string;
  citedStatutes: string[];
  courtLevel: string | null;
  judgmentDate: string | null;
  sourceUrl: string;
}

export interface ResearchFact {
  statement: string; quote: string; page: number | null; source: string;
  status: 'PENDING' | 'REVIEWED' | 'CONFLICT' | 'MISSING';
  reviewedAt?: string; reviewedById?: string;
  revisions?: Array<{ statement: string; status: string; at: string; userId: string }>;
}
export interface IntakePrecedentAnalysisItem {
  // Suggestions are proposals with source quotes, never automatically applied.
  extractedFacts?: { description?: string; caseSummary?: boolean; summaryOnly?: boolean; factsOnly?: boolean; factItems?: ResearchFact[]; suggestions?: Array<{ field: string; value: string; quote: string }>; completedTasks?: Array<{ taskId: string; title: string; quote: string }>; selectedAttachments?: Array<{ id: string; filename: string; version?: number }>; attachmentWarnings?: string[]; precedentWarning?: string };
  id: string;
  status: 'PENDING' | 'COMPLETE' | 'FAILED';
  precedents: IntakePrecedentItem[];
  /** Plain-language AI summary of the intake/docs events (may be null on older analyses). */
  documentSummary?: string | null;
  /** ข้อเท็จจริงเป็นข้อๆ (null/absent on older analyses). */
  factsList?: string[] | null;
  /** ไทม์ไลน์เหตุการณ์จากเอกสาร เรียงตามเวลา (null/absent on older analyses). */
  timeline?: Array<{ date: string; event: string }> | null;
  summaryBullets: string;
  noticeFacts: string;
  creditsCost: number;
  createdAt: string;
  errorMessage?: string | null;
}

export interface ConflictMatchItem {
  kind: 'CLIENT' | 'CLIENT_CONTACT' | 'CASE_PARTY' | 'CASE_CLIENT_NAME' | 'INTAKE_PARTY';
  term: string;
  name: string;
  side?: string;
  role?: string;
  caseId?: string;
  caseTitle?: string;
  ownRef?: string;
  caseStatus?: string;
  intakeId?: string;
  intakeTitle?: string;
  clientId?: string;
}

export interface ConflictSearchResult {
  terms: string[];
  matches: ConflictMatchItem[];
  matchCount: number;
  suggestedResult: 'CLEAR' | 'POTENTIAL_CONFLICT' | 'CONFLICT' | 'NEEDS_REVIEW';
}

export interface ConflictCheckRecord {
  id: string;
  intakeId: string | null;
  searchTerms: string[];
  matches: ConflictMatchItem[];
  matchCount: number;
  result: 'CLEAR' | 'POTENTIAL_CONFLICT' | 'CONFLICT' | 'NEEDS_REVIEW';
  notes: string | null;
  checkedAt: string;
  checkedBy?: { firstName: string; lastName: string };
}

export interface IntakeDocumentRequestItem {
  id: string;
  name: string;
  required: boolean;
  status: 'REQUESTED' | 'RECEIVED' | 'MISSING' | 'NOT_APPLICABLE';
  note: string | null;
  dueDate: string | null;
  documentId: string | null;
  receivedAt: string | null;
}

export interface IntakeDocumentRequestsResult {
  requests: IntakeDocumentRequestItem[];
  missing: IntakeDocumentRequestItem[];
  missingCount: number;
}

export interface IntakeFollowUpItem {
  id: string;
  note: string;
  contacted: boolean;
  nextDueAt: string | null;
  createdAt: string;
  createdBy?: { firstName: string; lastName: string };
}

export interface CaseOutstandingResult {
  openTasks: Array<{ id: string; title: string; status: string; dueDate: string | null }>;
  upcomingEvents: Array<{ id: string; title: string; startAt: string; type: string }>;
  unapprovedDocuments: Array<{ id: string; filename: string; category: string }>;
  total: number;
}

function announceDocumentUpload(scope: 'case' | 'intake', scopeId: string, document: DocumentItem) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('jev:document-uploaded', {
      detail: { scope, scopeId, documentId: document.id, filename: document.filename },
    }));
  }
}

export const api = {
  login: (email: string, password: string) =>
    request<import('@lawfirm/shared').LoginResult>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  /**
   * Apex has no localStorage session of its own — this mints one from the
   * cross-subdomain refresh cookie so the user isn't asked to log in twice.
   * Returns null rather than throwing when there's no valid cookie.
   */
  apexSession: async (): Promise<import('@lawfirm/shared').LoginResponse | null> => {
    try {
      const res = await fetch(`${API_URL}/auth/session`, {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  },

  verifyMfaLogin: (mfaToken: string, code: string) =>
    request<import('@lawfirm/shared').LoginResponse>('/auth/mfa/verify', {
      method: 'POST',
      body: JSON.stringify({ mfaToken, code }),
    }),

  requestEnableMfa: (token: string) =>
    request<{ message: string }>('/auth/mfa/enable/request', { method: 'POST', token }),

  confirmEnableMfa: (token: string, code: string) =>
    request<{ success: boolean }>('/auth/mfa/enable/confirm', { method: 'POST', token, body: JSON.stringify({ code }) }),

  disableMfa: (token: string, password: string) =>
    request<{ success: boolean }>('/auth/mfa/disable', { method: 'POST', token, body: JSON.stringify({ password }) }),

  logout: (refreshToken: string) =>
    request<{ success: boolean }>('/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken }), refreshAuth: false }),

  listSessions: (token: string) =>
    request<import('@lawfirm/shared').SessionInfo[]>('/auth/sessions', { token }),

  revokeSession: (token: string, id: string) =>
    request<{ success: boolean }>(`/auth/sessions/${id}`, { method: 'DELETE', token }),

  revokeOtherSessions: (token: string, refreshToken: string) =>
    request<{ success: boolean }>('/auth/sessions/revoke-others', {
      method: 'POST',
      token,
      body: JSON.stringify({ refreshToken }),
    }),

  register: (data: Record<string, string>) =>
    request<import('@lawfirm/shared').LoginResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  forgotPassword: (email: string) =>
    request<{ message: string; resetToken?: string }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  resetPassword: (token: string, password: string) =>
    request<{ success: boolean }>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    }),

  getSubscription: (token: string) =>
    request<import('@lawfirm/shared').SubscriptionSummary>('/saas/subscription', { token }),

  getPlans: (token: string) =>
    request<import('@lawfirm/shared').PlanOption[]>('/saas/plans', { token }),

  getBillingHistory: (token: string) =>
    request<BillingInvoiceItem[]>('/saas/billing/history', { token }),

  checkout: (
    token: string,
    plan: string,
    omiseToken?: string,
    omiseSource?: string,
    billingPeriod?: 'MONTHLY' | 'YEARLY',
  ) =>
    request<{ success: boolean; plan: string; invoiceId?: string }>('/saas/billing/checkout', {
      method: 'POST',
      token,
      body: JSON.stringify({ plan, omiseToken, omiseSource, billingPeriod }),
    }),

  checkoutPromptPay: (token: string, plan: string, billingPeriod?: 'MONTHLY' | 'YEARLY') =>
    request<{
      invoiceId: string;
      chargeId: string;
      amount: number;
      expiresAt: string;
      paid: boolean;
    }>('/saas/billing/checkout/promptpay', {
      method: 'POST',
      token,
      body: JSON.stringify({ plan, billingPeriod }),
    }),

  getInvoiceQrBlob: (token: string, invoiceId: string) =>
    fetchBlob(`/saas/billing/invoices/${invoiceId}/qr`, { token }),

  getInvoicePaymentStatus: (token: string, invoiceId: string) =>
    request<{ status: 'PENDING' | 'PAID' | 'FAILED'; plan: string }>(
      `/saas/billing/invoices/${invoiceId}/status`,
      { token },
    ),

  cancelSubscription: (token: string) =>
    request<{ success: boolean }>('/saas/billing/cancel', { method: 'POST', token }),

  inviteUser: (token: string, email: string, role?: string) =>
    request<{ inviteUrl: string; email: string; role: string; expiresAt: string; emailSent?: boolean }>(
      '/saas/invitations',
      { method: 'POST', token, body: JSON.stringify({ email, role }) },
    ),

  listInvitations: (token: string) =>
    request<
      {
        id: string;
        email: string;
        role: string;
        expiresAt: string;
        createdAt: string;
      }[]
    >('/saas/invitations', { token }),

  getTeamMembers: (token: string) =>
    request<
      {
        id: string;
        email: string;
        firstName: string;
        lastName: string;
        role: string;
        firmRole: string;
        joinedAt: string;
      }[]
    >('/saas/members', { token }),

  removeTeamMember: (token: string, userId: string) =>
    request<{ success: boolean }>(`/saas/members/${userId}`, { method: 'DELETE', token }),

  updateMemberRole: (token: string, userId: string, role: string) =>
    request<{ success: boolean }>(`/saas/members/${userId}/role`, {
      method: 'PATCH',
      token,
      body: JSON.stringify({ role }),
    }),

  cancelInvitation: (token: string, invitationId: string) =>
    request<{ success: boolean }>(`/saas/invitations/${invitationId}`, {
      method: 'DELETE',
      token,
    }),

  getInvitation: (inviteToken: string) =>
    request<{ email: string; firmName: string; role: string }>(`/saas/invitations/${inviteToken}`),

  getPublicFirm: (slug: string) =>
    request<{ name: string; slug: string }>(`/firms/${encodeURIComponent(slug)}/public`, {}),

  joinFirm: (slug: string, data: { email: string; password: string; firstName: string; lastName: string }) =>
    request<import('@lawfirm/shared').LoginResponse>(`/firms/${encodeURIComponent(slug)}/join`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  acceptInvitation: (data: Record<string, string>) =>
    request<import('@lawfirm/shared').LoginResponse>('/saas/invitations/accept', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getOmiseConfig: () =>
    request<{ publicKey: string | null; mockMode: boolean }>('/saas/omise/public-key'),

  getMe: (token: string, options?: { refreshAuth?: boolean }) =>
    request<import('@lawfirm/shared').AuthUser>('/auth/me', { token, ...options }),

  getDashboardStats: (token: string) =>
    request<DashboardStats>('/dashboard/stats', { token }),

  getReportsSummary: (token: string) =>
    request<ReportsSummary>('/reports/summary', { token }),

  getFinanceSummary: (token: string) =>
    request<FinanceSummary>('/finance/summary', { token }),

  getFirmInvoices: (token: string) =>
    request<FirmInvoiceItem[]>('/invoices', { token }),

  markInvoiceSent: (token: string, invoiceId: string) =>
    request<FirmInvoiceItem>(`/invoices/${invoiceId}/send`, { method: 'PATCH', token }),

  recordInvoicePayment: (token: string, invoiceId: string, data: RecordInvoicePaymentInput) =>
    request<RecordInvoicePaymentResult>(`/invoices/${invoiceId}/payments`, {
      method: 'POST',
      token,
      body: JSON.stringify(data),
    }),

  getInvoicePayments: (token: string, invoiceId: string) =>
    request<InvoicePaymentItem[]>(`/invoices/${invoiceId}/payments`, { token }),

  getReceivables: (token: string) =>
    request<ReceivablesResult>('/invoices/receivables', { token }),

  /** เงียบ — เรียกทีละใบระหว่างทวงหลายใบพร้อมกัน ให้ toast สรุปรวมทำหน้าที่แจ้งผลแทน */
  remindInvoice: (token: string, invoiceId: string) =>
    request<RemindInvoiceResult>(`/invoices/${invoiceId}/remind`, { method: 'POST', token, silent: true }),

  getCases: (
    token: string,
    params?: {
      status?: string;
      stage?: string;
      search?: string;
      party?: string;
      caseTypeId?: string;
      userId?: string;
    },
  ) => {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.stage) query.set('stage', params.stage);
    if (params?.party) query.set('party', params.party);
    if (params?.search) query.set('search', params.search);
    if (params?.caseTypeId) query.set('caseTypeId', params.caseTypeId);
    if (params?.userId) query.set('userId', params.userId);
    const qs = query.toString();
    return request<CaseItem[]>(`/cases${qs ? `?${qs}` : ''}`, { token });
  },

  getCase: (token: string, id: string) =>
    request<CaseDetail>(`/cases/${id}`, { token }),

  getNextOwnRef: (token: string) =>
    request<{ ownRef: string }>('/cases/next-own-ref', { token }),

  createCase: (token: string, data: Record<string, unknown>) =>
    request('/cases', {
      method: 'POST',
      token,
      body: JSON.stringify(data),
    }),

  updateCase: (token: string, id: string, data: Record<string, unknown>) =>
    request(`/cases/${id}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify(data),
    }),

  getCaseCargoClaim: (token: string, id: string) =>
    request<CargoClaimItem | null>(`/cases/${id}/cargo-claim`, { token }),

  enableCaseCargoClaim: (token: string, id: string, data: CargoClaimInput = {}) =>
    request<CargoClaimItem>(`/cases/${id}/cargo-claim`, {
      method: 'POST', token, body: JSON.stringify(data),
    }),

  updateCaseCargoClaim: (token: string, id: string, data: CargoClaimInput) =>
    request<CargoClaimItem>(`/cases/${id}/cargo-claim`, {
      method: 'PATCH', token, body: JSON.stringify(data),
    }),

  updateCaseCargoRequirement: (
    token: string,
    id: string,
    requirementId: string,
    data: Partial<Pick<CargoDocumentRequirementItem, 'required' | 'status' | 'note' | 'documentId'>>,
  ) => request<CargoDocumentRequirementItem>(`/cases/${id}/cargo-claim/requirements/${requirementId}`, {
    method: 'PATCH', token, body: JSON.stringify(data),
  }),

  closeCase: (
    token: string,
    id: string,
    closingSummary: string,
    options: { outcome?: string; acknowledgeOutstanding?: boolean } = {},
  ) =>
    request<CaseItem>(`/cases/${id}/close`, {
      method: 'POST',
      token,
      body: JSON.stringify({ closingSummary, ...options }),
    }),

  getCaseOutstanding: (token: string, id: string) =>
    request<CaseOutstandingResult>(`/cases/${id}/outstanding`, { token }),

  archiveCase: (token: string, id: string) =>
    request<CaseItem>(`/cases/${id}/archive`, { method: 'POST', token }),

  /** ค้นชื่อทั่วสำนักงาน — ใช้ทั้ง conflict check และ "คนนี้อยู่คดีไหนบ้าง" */
  conflictSearch: (token: string, terms: string[]) =>
    request<ConflictSearchResult>(
      `/conflict-check/search?${terms.map((t) => `terms=${encodeURIComponent(t)}`).join('&')}`,
      { token },
    ),

  listConflictChecks: (token: string, intakeId?: string) =>
    request<ConflictCheckRecord[]>(
      `/conflict-check${intakeId ? `?intakeId=${intakeId}` : ''}`,
      { token },
    ),

  recordConflictCheck: (
    token: string,
    data: { terms: string[]; intakeId?: string; result: string; notes?: string },
  ) =>
    request<ConflictCheckRecord>('/conflict-check', {
      method: 'POST',
      token,
      body: JSON.stringify(data),
    }),

  updateIntakeStage: (token: string, id: string, stage: string, note?: string) =>
    request<IntakeItem>(`/intake/${id}/stage`, {
      method: 'PATCH',
      token,
      body: JSON.stringify({ stage, note }),
    }),

  getIntakeDocumentRequests: (token: string, id: string) =>
    request<IntakeDocumentRequestsResult>(`/intake/${id}/document-requests`, { token }),

  addIntakeDocumentRequests: (
    token: string,
    id: string,
    items: Array<{ name: string; required?: boolean; dueDate?: string; note?: string }>,
  ) =>
    request<IntakeDocumentRequestsResult>(`/intake/${id}/document-requests`, {
      method: 'POST',
      token,
      body: JSON.stringify({ items }),
    }),

  updateIntakeDocumentRequest: (
    token: string,
    id: string,
    requestId: string,
    data: { status?: string; note?: string; dueDate?: string; required?: boolean },
  ) =>
    request<IntakeDocumentRequestsResult>(`/intake/${id}/document-requests/${requestId}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify(data),
    }),

  removeIntakeDocumentRequest: (token: string, id: string, requestId: string) =>
    request<IntakeDocumentRequestsResult>(`/intake/${id}/document-requests/${requestId}`, {
      method: 'DELETE',
      token,
    }),

  addIntakeFollowUp: (
    token: string,
    id: string,
    data: { note: string; contacted?: boolean; nextDueAt?: string; nextOwnerId?: string },
  ) =>
    request<IntakeFollowUpItem>(`/intake/${id}/follow-ups`, {
      method: 'POST',
      token,
      body: JSON.stringify(data),
    }),

  listIntakeFollowUps: (token: string, id: string) =>
    request<IntakeFollowUpItem[]>(`/intake/${id}/follow-ups`, { token }),

  markIntakeNoResponse: (token: string, id: string, note?: string) =>
    request<IntakeItem>(`/intake/${id}/no-response`, {
      method: 'POST',
      token,
      body: JSON.stringify({ note }),
    }),

  updateDocumentMetadata: (
    token: string,
    caseId: string,
    documentId: string,
    data: { category?: string; documentDate?: string; tags?: string[] },
  ) =>
    request<DocumentItem>(`/cases/${caseId}/documents/${documentId}/metadata`, {
      method: 'PATCH',
      token,
      body: JSON.stringify(data),
    }),

  reopenCase: (token: string, id: string) =>
    request<CaseItem>(`/cases/${id}/reopen`, {
      method: 'POST',
      token,
    }),

  getLawyers: (token: string) => request<UserItem[]>('/users/lawyers', { token }),

  getWorkloadSummary: (token: string, nearDeadlineDays = 7) =>
    request<WorkloadSummary[]>(`/operations/workload?nearDeadlineDays=${nearDeadlineDays}`, { token }),

  getWorkloadDetail: (token: string, userId: string, nearDeadlineDays = 7) =>
    request<WorkloadDetail>(`/operations/workload/${userId}?nearDeadlineDays=${nearDeadlineDays}`, { token }),

  getPairing: (token: string) => request<PairingEntry[]>('/operations/pairing', { token }),

  getOnHoldTasks: (token: string) =>
    request<OnHoldTaskEntry[]>('/operations/onhold', { token }),

  searchDocuments: (token: string, q?: string, category?: string) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (category) params.set('category', category);
    return request<Array<DocumentItem & { case: { id: string; title: string; ownRef: string } | null }>>(
      `/documents/search?${params.toString()}`,
      { token },
    );
  },

  searchDocumentContent: (token: string, q: string) =>
    request<Array<{
      documentId: string;
      filename: string;
      pageStart: number | null;
      pageEnd: number | null;
      snippet: string;
      score: number;
      caseId: string;
      caseTitle: string;
      caseOwnRef: string;
    }>>(`/documents/search-content?q=${encodeURIComponent(q)}`, { token }),

  getCaseHealth: (token: string) =>
    request<CaseHealth>('/operations/case-health', { token }),

  getSlaConfig: (token: string) => request<SlaConfig>('/operations/sla', { token }),

  updateSlaConfig: (token: string, config: Partial<SlaConfig>) =>
    request<SlaConfig>('/operations/sla', { method: 'PATCH', token, body: JSON.stringify(config) }),

  getTeamPerformance: (token: string, days = 30) =>
    request<TeamPerformanceRow[]>(`/operations/performance?days=${days}`, { token }),

  getWorkflowMetrics: (token: string, days = 30) =>
    request<WorkflowMetrics>(`/operations/workflow-metrics?days=${days}`, { token }),

  getOwnerKpis: (token: string, month?: string) =>
    request<OwnerKpis>(`/operations/owner-kpis${month ? `?month=${month}` : ''}`, { token }),

  listSops: (token: string, q?: string) =>
    request<SopItem[]>(`/sops${q ? `?q=${encodeURIComponent(q)}` : ''}`, { token }),

  createSop: (token: string, data: { title: string; content: string; category?: string }) =>
    request<SopItem>('/sops', { method: 'POST', token, body: JSON.stringify(data) }),

  updateSop: (token: string, id: string, data: Partial<{ title: string; content: string; category: string }>) =>
    request<SopItem>(`/sops/${id}`, { method: 'PATCH', token, body: JSON.stringify(data) }),

  deleteSop: (token: string, id: string) =>
    request<{ deleted: boolean }>(`/sops/${id}`, { method: 'DELETE', token }),

  getRequiredDocuments: (token: string, caseId: string) =>
    request<RequiredDocumentsResult>(`/cases/${caseId}/documents/required`, { token }),

  setDocumentConfirmed: (token: string, caseId: string, category: string, confirmed: boolean) =>
    request<RequiredDocumentsResult>(`/cases/${caseId}/documents/required`, {
      method: 'PATCH',
      token,
      body: JSON.stringify({ category, confirmed }),
    }),

  updateDocumentCategory: (token: string, caseId: string, documentId: string, category: string | null) =>
    request<{ id: string }>(`/cases/${caseId}/documents/${documentId}/metadata`, {
      method: 'PATCH',
      token,
      // ล้างหมวด = กลับไปเป็น OTHER เพราะคอลัมน์เป็น enum ไม่ใช่ nullable text
      body: JSON.stringify({ category: category ?? 'OTHER' }),
    }),

  getIntakeChecklist: (token: string, intakeId: string) =>
    request<Array<{ label: string; documentId: string | null; confirmedAt: string | null }>>(
      `/intake/${intakeId}/checklist`,
      { token },
    ),

  setIntakeChecklistItem: (token: string, intakeId: string, label: string, documentId: string | null, requestId?: string) =>
    request<{ label: string; documentId: string | null }>(`/intake/${intakeId}/checklist`, {
      method: 'PATCH',
      token,
      body: JSON.stringify({ label, documentId, requestId }),
    }),

  startTaskOnHold: (
    token: string,
    caseId: string,
    taskId: string,
    data: { reason: string; category?: string; followerUserId?: string; nextFollowUpAt?: string },
  ) =>
    request<{ id: string }>(`/cases/${caseId}/tasks/${taskId}/hold`, {
      method: 'PATCH',
      token,
      body: JSON.stringify(data),
    }),

  resumeTaskFromOnHold: (token: string, caseId: string, taskId: string) =>
    request<{ id: string }>(`/cases/${caseId}/tasks/${taskId}/hold/resume`, {
      method: 'POST',
      token,
    }),

  updateCaseAssignments: (token: string, caseId: string, buddyIds: string[]) =>
    request<CaseDetail>(`/cases/${caseId}/assignments`, {
      method: 'PUT',
      token,
      body: JSON.stringify({ buddyIds }),
    }),

  getUsers: (token: string) => request<UserItem[]>('/users', { token }),

  createUser: (token: string, data: Record<string, unknown>) =>
    request('/users', {
      method: 'POST',
      token,
      body: JSON.stringify(data),
    }),

  getTasks: (token: string, caseId: string) =>
    request<TaskItem[]>(`/cases/${caseId}/tasks`, { token }),

  // Playbook step ที่ผูกกับขั้นตอนคดี — เสนองานให้สร้างตอนย้ายขั้น
  getStageTaskProposals: (token: string, caseId: string, stage: string) =>
    request<StageTaskProposal[]>(`/practice-setup/cases/${caseId}/stage-tasks?stage=${stage}`, { token }),
  createStageTasks: (token: string, caseId: string, stage: string, tasks: StageTaskDraft[]) =>
    request<{ created: number; taskIds: string[] }>(`/practice-setup/cases/${caseId}/stage-tasks`, {
      method: 'POST',
      token,
      body: JSON.stringify({ stage, tasks }),
    }),

  // งาน/checklist ของเรื่องรับเข้า — เปิดคดีแล้วงานถูกย้ายไปเป็นงานคดีอัตโนมัติ
  getIntakeTasks: (token: string, intakeId: string) =>
    request<TaskItem[]>(`/intake/${intakeId}/tasks`, { token }),
  createIntakeTask: (token: string, intakeId: string, data: Record<string, unknown>) =>
    request(`/intake/${intakeId}/tasks`, { method: 'POST', token, body: JSON.stringify(data) }),
  updateIntakeTask: (token: string, intakeId: string, taskId: string, data: Record<string, unknown>) =>
    request(`/intake/${intakeId}/tasks/${taskId}`, { method: 'PATCH', token, body: JSON.stringify(data) }),
  deleteIntakeTask: (token: string, intakeId: string, taskId: string) =>
    request(`/intake/${intakeId}/tasks/${taskId}`, { method: 'DELETE', token }),

  getTaskInbox: (token: string) => request<Array<TaskItem & { assigneeId: string | null }>>('/dashboard/tasks', { token }),
  getMyTodos: (token: string) => request<TaskItem[]>('/todos', { token }),

  getActionQueue: (token: string) => request<import('@/components/agenda/ActionCenter').ActionQueue>('/agenda/actions', { token }),

  getMyDay: (token: string) => request<MyDayResponse>('/agenda/my-day', { token }),

  getMyPreferences: (token: string) =>
    request<NotificationPreferences>('/users/me/preferences', { token }),

  updateMyPreferences: (token: string, data: { dailyDigestEnabled?: boolean }) =>
    request<NotificationPreferences>('/users/me/preferences', {
      method: 'PATCH',
      token,
      body: JSON.stringify(data),
    }),

  getDeadlineRules: (token: string) =>
    request<DeadlineRuleItem[]>('/deadline-rules', { token }),

  createDeadlineRule: (token: string, data: Record<string, unknown>) =>
    request<DeadlineRuleItem>('/deadline-rules', {
      method: 'POST',
      token,
      body: JSON.stringify(data),
    }),

  updateDeadlineRule: (token: string, id: string, data: Record<string, unknown>) =>
    request<{ updated: boolean }>(`/deadline-rules/${id}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify(data),
    }),

  deleteDeadlineRule: (token: string, id: string) =>
    request<{ deleted: boolean }>(`/deadline-rules/${id}`, { method: 'DELETE', token }),

  getPublicHolidays: (token: string, year?: number) =>
    request<PublicHolidayItem[]>(`/public-holidays${year ? `?year=${year}` : ''}`, { token }),

  addPublicHoliday: (token: string, data: { date: string; name: string }) =>
    request<{ created: number }>('/public-holidays', {
      method: 'POST',
      token,
      body: JSON.stringify(data),
    }),

  replacePublicHolidayYear: (
    token: string,
    data: { year: number; holidays: Array<{ date: string; name: string }> },
  ) =>
    request<{ replaced: number }>('/public-holidays', {
      method: 'PUT',
      token,
      body: JSON.stringify(data),
    }),

  applyDeadlineTrigger: (
    token: string,
    caseId: string,
    data: { trigger: DeadlineTriggerValue; triggerDate: string },
  ) =>
    request<{ created: number }>(`/cases/${caseId}/deadlines/apply`, {
      method: 'POST',
      token,
      body: JSON.stringify(data),
    }),

  deletePublicHoliday: (token: string, id: string) =>
    request<{ deleted: boolean }>(`/public-holidays/${id}`, { method: 'DELETE', token }),

  createTodo: (token: string, data: Record<string, unknown>) =>
    request<TaskItem>('/todos', {
      method: 'POST',
      token,
      body: JSON.stringify(data),
    }),

  updateTodo: (token: string, taskId: string, data: Record<string, unknown>) =>
    request<TaskItem>(`/todos/${taskId}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify(data),
    }),

  handoffTodo: (
    token: string,
    taskId: string,
    data: { reviewerId: string; note?: string; stageDueDate?: string },
  ) =>
    request<TaskItem>(`/todos/${taskId}/handoff`, {
      method: 'PATCH',
      token,
      body: JSON.stringify(data),
    }),

  acceptTodo: (token: string, taskId: string) =>
    request<TaskItem>(`/todos/${taskId}/accept`, {
      method: 'POST',
      token,
    }),

  rejectTodo: (token: string, taskId: string, data: { reason: string }) =>
    request<TaskItem>(`/todos/${taskId}/reject`, {
      method: 'POST',
      token,
      body: JSON.stringify(data),
    }),

  createTask: (token: string, caseId: string, data: Record<string, unknown>) =>
    request(`/cases/${caseId}/tasks`, {
      method: 'POST',
      token,
      body: JSON.stringify(data),
    }),

  updateTask: (
    token: string,
    caseId: string,
    taskId: string,
    data: Record<string, unknown>,
  ) =>
    request(`/cases/${caseId}/tasks/${taskId}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify(data),
    }),

  handoffTask: (
    token: string,
    caseId: string,
    taskId: string,
    data: { note?: string; stageDueDate?: string },
  ) =>
    request<TaskItem>(`/cases/${caseId}/tasks/${taskId}/handoff`, {
      method: 'PATCH',
      token,
      body: JSON.stringify(data),
    }),

  acceptTask: (token: string, caseId: string, taskId: string) =>
    request<TaskItem>(`/cases/${caseId}/tasks/${taskId}/accept`, {
      method: 'POST',
      token,
    }),

  rejectTask: (token: string, caseId: string, taskId: string, data: { reason: string }) =>
    request<TaskItem>(`/cases/${caseId}/tasks/${taskId}/reject`, {
      method: 'POST',
      token,
      body: JSON.stringify(data),
    }),

  reassignTask: (
    token: string,
    caseId: string,
    taskId: string,
    data: { assigneeId: string; stageDueDate?: string },
  ) =>
    request<TaskItem>(`/cases/${caseId}/tasks/${taskId}/reassign`, {
      method: 'PATCH',
      token,
      body: JSON.stringify(data),
    }),

  getCourtDay: (token: string, id: string) =>
    request<import('./court-day').CourtDayResponse>(`/calendar/events/${id}/court-day`, { token }),
  saveCourtDay: (token: string, id: string, version: number, state: import('./court-day').CourtDayState) =>
    request<import('./court-day').CourtDayWorkspace>(`/calendar/events/${id}/court-day`, { token, method: 'PATCH', body: JSON.stringify({ version, state }) }),
  completeCourtDay: (token: string, id: string, version: number, eventUpdatedAt: string) =>
    request<import('./court-day').CourtDayWorkspace>(`/calendar/events/${id}/court-day/complete`, { token, method: 'POST', body: JSON.stringify({ version, eventUpdatedAt }) }),

  getCalendarEvents: (
    token: string,
    params?: { from?: string; to?: string },
  ) => {
    const query = new URLSearchParams();
    if (params?.from) query.set('from', params.from);
    if (params?.to) query.set('to', params.to);
    const qs = query.toString();
    return request<CalendarEventItem[]>(`/calendar/events${qs ? `?${qs}` : ''}`, { token });
  },

  getLeaves: (token: string, from: string, to: string) =>
    request<LeaveItem[]>(`/leaves?${new URLSearchParams({ from, to })}`, { token }),
  createLeave: (token: string, data: { type: 'SICK' | 'PERSONAL' | 'VACATION'; startDate: string; endDate: string }) =>
    request<LeaveItem>('/leaves', { token, method: 'POST', body: JSON.stringify(data) }),
  decideLeave: (token: string, id: string, decision: 'APPROVED' | 'REJECTED') =>
    request<LeaveItem>(`/leaves/${id}/decision`, { token, method: 'PATCH', body: JSON.stringify({ decision }) }),
  cancelLeave: (token: string, id: string) =>
    request(`/leaves/${id}`, { token, method: 'DELETE' }),

  getEventResponsibility: (token: string, id: string) => request<import('@/components/calendar/EventResponsibility').Responsibility>(`/calendar/events/${id}/responsibility`, { token }),
  acknowledgeEvent: (token: string, id: string, eventUpdatedAt: string, complete = false) => request(`/calendar/events/${id}/${complete ? 'complete-work' : 'acknowledge'}`, { token, method: 'POST', body: JSON.stringify({ eventUpdatedAt }) }),
  previewEventReschedule: (token: string, id: string, startAt: string) => request<import('@/components/calendar/EventResponsibility').ReschedulePreview>(`/calendar/events/${id}/reschedule-preview`, { token, method: 'POST', body: JSON.stringify({ startAt }) }),
  rescheduleEvent: (token: string, id: string, data: { startAt: string; fingerprint: string; reason: string }) => request(`/calendar/events/${id}/reschedule`, { token, method: 'POST', body: JSON.stringify(data) }),
  getCalendarEvent: (token: string, id: string) =>
    request<CalendarEventItem>(`/calendar/events/${id}`, { token }),

  createCalendarEvent: (token: string, data: Record<string, unknown>) =>
    request<CalendarEventItem>('/calendar/events', {
      method: 'POST',
      token,
      body: JSON.stringify(data),
    }),

  updateCalendarEvent: (token: string, id: string, data: Record<string, unknown>) =>
    request<CalendarEventItem>(`/calendar/events/${id}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify(data),
    }),

  deleteCalendarEvent: (token: string, id: string) =>
    request(`/calendar/events/${id}`, { method: 'DELETE', token }),

  getCaseTypes: (token: string, activeOnly = true) =>
    request<CaseTypeItem[]>(`/case-types?activeOnly=${activeOnly}`, { token }),

  getClients: (token: string, search?: string) => {
    const qs = search ? `?search=${encodeURIComponent(search)}` : '';
    return request<ClientItem[]>(`/clients${qs}`, { token });
  },

  getClient: (token: string, id: string) =>
    request<ClientItem>(`/clients/${id}`, { token }),

  createClient: (token: string, data: Record<string, unknown>) =>
    request<ClientItem>('/clients', { method: 'POST', token, body: JSON.stringify(data) }),

  updateClient: (token: string, id: string, data: Record<string, unknown>) =>
    request<ClientItem>(`/clients/${id}`, { method: 'PATCH', token, body: JSON.stringify(data) }),

  getContactLineStatus: (token: string, contactId: string) =>
    request<{ connected: boolean; connectedAt: string | null }>(
      `/clients/contacts/${contactId}/line-status`,
      { token },
    ),

  sendPortalInvite: (token: string, clientContactId: string) =>
    request<{
      id: string;
      expiresAt: string;
      inviteUrl: string;
      emailSent: boolean;
      lineSent: boolean;
    }>('/client-portal/invites', {
      method: 'POST',
      token,
      body: JSON.stringify({ clientContactId }),
    }),

  getCourts: (token: string, activeOnly = true) =>
    request<CourtItem[]>(`/courts?activeOnly=${activeOnly}`, { token }),

  getAuditLogs: (token: string, params?: { action?: string; cursor?: string; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.action) query.set('action', params.action);
    if (params?.cursor) query.set('cursor', params.cursor);
    if (params?.limit) query.set('limit', String(params.limit));
    const qs = query.toString();
    return request<AuditLogResult>(`/admin/audit-logs${qs ? `?${qs}` : ''}`, { token });
  },

  createCourt: (token: string, data: Record<string, unknown>) =>
    request<CourtItem>('/courts', { method: 'POST', token, body: JSON.stringify(data) }),

  updateCourt: (token: string, id: string, data: Record<string, unknown>) =>
    request<CourtItem>(`/courts/${id}`, { method: 'PATCH', token, body: JSON.stringify(data) }),

  getCaseActivities: (token: string, caseId: string) =>
    request<CaseActivityItem[]>(`/cases/${caseId}/activities`, { token }),

  createCaseActivity: (token: string, caseId: string, data: Record<string, unknown>) =>
    request<CaseActivityItem>(`/cases/${caseId}/activities`, {
      method: 'POST',
      token,
      body: JSON.stringify(data),
    }),

  getCaseMessages: (token: string, caseId: string) =>
    request<CaseMessageEntry[]>(`/cases/${caseId}/messages`, { token }),

  sendCaseMessage: (token: string, caseId: string, body: string, file?: File) => {
    if (file) {
      const form = new FormData();
      form.append('body', body);
      form.append('file', file);
      // ปล่อยให้ browser ใส่ Content-Type เองพร้อม boundary
      return request<CaseMessageEntry>(`/cases/${caseId}/messages`, {
        method: 'POST',
        token,
        body: form,
      });
    }
    return request<CaseMessageEntry>(`/cases/${caseId}/messages`, {
      method: 'POST',
      token,
      body: JSON.stringify({ body }),
    });
  },

  getInsuranceClaim: (token: string, caseId: string) =>
    request<InsuranceClaimItem>(`/cases/${caseId}/insurance-claim`, { token }),

  createInsuranceClaim: (token: string, caseId: string, data: Record<string, unknown>) =>
    request<InsuranceClaimItem>(`/cases/${caseId}/insurance-claim`, {
      method: 'POST',
      token,
      body: JSON.stringify(data),
    }),

  updateInsuranceClaim: (token: string, caseId: string, data: Record<string, unknown>) =>
    request<InsuranceClaimItem>(`/cases/${caseId}/insurance-claim`, {
      method: 'PATCH',
      token,
      body: JSON.stringify(data),
    }),

  advanceInsuranceClaimStage: (token: string, caseId: string, stage: string) =>
    request<InsuranceClaimItem>(`/cases/${caseId}/insurance-claim/advance-stage`, {
      method: 'POST',
      token,
      body: JSON.stringify({ stage }),
    }),

  createCaseType: (token: string, data: Record<string, unknown>) =>
    request<CaseTypeItem>('/case-types', { method: 'POST', token, body: JSON.stringify(data) }),

  updateCaseType: (token: string, id: string, data: Record<string, unknown>) =>
    request(`/case-types/${id}`, { method: 'PATCH', token, body: JSON.stringify(data) }),

  deleteCaseType: (token: string, id: string) =>
    request<{ deleted: boolean }>(`/case-types/${id}`, { method: 'DELETE', token }),

  getExpenses: (token: string, params?: { status?: string; userId?: string }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.userId) qs.set('userId', params.userId);
    const query = qs.toString();
    return request<ExpenseItem[]>(`/expenses${query ? `?${query}` : ''}`, { token });
  },

  createExpense: (token: string, caseId: string, data: Record<string, unknown>) =>
    request(`/cases/${caseId}/billing/expenses`, {
      method: 'POST',
      token,
      body: JSON.stringify(data),
    }),

  getCaseExpenses: (token: string, caseId: string) =>
    request<ExpenseItem[]>(`/cases/${caseId}/billing/expenses`, { token }),

  updateExpenseStatus: (token: string, expenseId: string, status: string) =>
    request(`/expenses/${expenseId}/status`, {
      method: 'PATCH',
      token,
      body: JSON.stringify({ status }),
    }),

  submitExpenses: (token: string, expenseIds: string[]) =>
    request<ExpenseClaimSummary>('/expenses/submit', {
      method: 'POST',
      token,
      body: JSON.stringify({ expenseIds }),
    }),

  getExpenseClaims: (token: string, params?: { status?: string; userId?: string }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.userId) qs.set('userId', params.userId);
    const query = qs.toString();
    return request<ExpenseClaimSummary[]>(`/expense-claims${query ? `?${query}` : ''}`, { token });
  },

  getExpenseClaim: (token: string, claimId: string) =>
    request<ExpenseClaimSummary>(`/expense-claims/${claimId}`, { token }),

  updateExpenseClaimStatus: (token: string, claimId: string, status: string) =>
    request<ExpenseClaimSummary>(`/expense-claims/${claimId}/status`, {
      method: 'PATCH',
      token,
      body: JSON.stringify({ status }),
    }),

  getDocuments: (
    token: string,
    caseId: string,
    filters: { category?: string; tag?: string; search?: string } = {},
  ) => {
    const qs = new URLSearchParams(
      Object.entries(filters).filter(([, v]) => !!v) as [string, string][],
    ).toString();
    return request<DocumentItem[]>(`/cases/${caseId}/documents${qs ? `?${qs}` : ''}`, { token });
  },

  getDocumentCategoryCounts: (token: string, caseId: string) =>
    request<Array<{ category: string; count: number }>>(
      `/cases/${caseId}/documents/category-counts`,
      { token },
    ),

  getTimeEntries: (token: string, caseId: string) =>
    request<TimeEntryItem[]>(`/cases/${caseId}/billing/time-entries`, { token }),

  getTimeSuggestions: (token: string, date: string) =>
    request<TimeSuggestion[]>(`/time-entries/suggestions?date=${date}`, { token }),

  confirmTimeEntries: (token: string, entries: ConfirmTimeEntryInput[]) =>
    request<{ created: number }>('/time-entries/confirm', {
      method: 'POST',
      token,
      body: JSON.stringify({ entries }),
    }),

  getFirmTimesheet: (token: string, params: { from: string; to: string; userId?: string }) => {
    const qs = new URLSearchParams({ from: params.from, to: params.to });
    if (params.userId) qs.set('userId', params.userId);
    return request<FirmTimesheetResponse>(`/time-entries?${qs.toString()}`, { token });
  },

  getInvoices: (token: string, caseId: string) =>
    request<InvoiceItem[]>(`/cases/${caseId}/billing/invoices`, { token }),

  setExpenseBillable: (token: string, expenseId: string, billable: boolean) =>
    request<{ id: string; billable: boolean }>(`/expenses/${expenseId}/billable`, {
      token,
      method: 'PATCH',
      body: JSON.stringify({ billable }),
    }),

  getIntakeInvoices: (token: string, intakeId: string) =>
    request<InvoiceItem[]>(`/intakes/${intakeId}/billing/invoices`, { token }),

  createIntakeInvoice: (token: string, intakeId: string, data: CreateInvoiceInput) =>
    request<InvoiceItem[]>(`/intakes/${intakeId}/billing/invoices`, {
      token,
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getStandaloneInvoices: (token: string) =>
    request<InvoiceItem[]>('/invoices/standalone', { token }),

  getInvoicePrintData: (token: string, invoiceId: string) =>
    request<InvoicePrintData>(`/invoices/${invoiceId}/print-data`, { token }),

  createStandaloneInvoice: (token: string, data: CreateInvoiceInput) =>
    request<InvoiceItem[]>('/invoices', {
      token,
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getInvoiceDraft: (token: string, caseId: string) =>
    request<InvoiceDraft>(`/cases/${caseId}/billing/invoices/draft`, { token }),

  // คืนเป็น array เสมอ: คดีที่มีผู้ว่าจ้างหลายรายได้ใบแจ้งหนี้รายละใบ
  createInvoice: (token: string, caseId: string, data: CreateInvoiceInput) =>
    request<InvoiceItem[]>(`/cases/${caseId}/billing/invoices`, {
      token,
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getExpenseSummary: (token: string, caseId: string) =>
    request<{ totalSpent: number; revenue: number; profit: number }>(
      `/cases/${caseId}/billing/summary`,
      { token },
    ),

  createStandaloneExpense: (token: string, data: Record<string, unknown>, receipt?: File) => {
    if (receipt) {
      const form = new FormData();
      for (const [key, value] of Object.entries(data)) {
        if (value !== undefined && value !== null && value !== '') {
          form.append(key, String(value));
        }
      }
      form.append('receipt', receipt);
      return request('/expenses', { method: 'POST', token, body: form });
    }
    return request('/expenses', { method: 'POST', token, body: JSON.stringify(data) });
  },

  downloadExpenseReceipt: (token: string, expenseId: string) =>
    fetchBlob(`/expenses/${expenseId}/receipt`, { token }),

  getPettyCash: (token: string) =>
    request<{ balance: number }>('/petty-cash', { token }),

  issueCashAdvance: (token: string, userId: string, amount: number, note?: string) =>
    request<CashAdvanceItem>('/cash-advances', {
      method: 'POST',
      token,
      body: JSON.stringify({ userId, amount, note }),
    }),

  listCashAdvances: (token: string, userId?: string) =>
    request<CashAdvanceItem[]>(`/cash-advances${userId ? `?userId=${userId}` : ''}`, { token }),

  listMyCashAdvances: (token: string) =>
    request<CashAdvanceItem[]>('/cash-advances/mine', { token }),

  getCaseKnowledge: (token: string, caseId: string) =>
    request<KnowledgeItem[]>(`/cases/${caseId}/knowledge`, { token }),

  reviewCaseKnowledge: (token: string, caseId: string, id: string, summary?: string) =>
    request<KnowledgeItem>(`/cases/${caseId}/knowledge/${id}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify(summary !== undefined ? { summary } : {}),
    }),

  getKnowledge: (
    token: string,
    params?: { caseId?: string; category?: string; search?: string },
  ) => {
    const query = new URLSearchParams();
    if (params?.caseId) query.set('caseId', params.caseId);
    if (params?.category) query.set('category', params.category);
    if (params?.search) query.set('search', params.search);
    const qs = query.toString();
    return request<KnowledgeItem[]>(`/knowledge${qs ? `?${qs}` : ''}`, { token });
  },

  askCase: (token: string, caseId: string, question: string, documentIds?: string[]) =>
    request<{
      answer: string;
      sources: Array<{
        documentId: string;
        filename: string;
        pageStart: number | null;
        pageEnd: number | null;
        snippet: string;
        score: number;
      }>;
    }>(`/cases/${caseId}/ai/ask`, {
      method: 'POST',
      token,
      body: JSON.stringify({ question, ...(documentIds?.length ? { documentIds } : {}) }),
    }),

  getAiUsageSummary: (token: string, days = 30) =>
    request<AiUsageSummary>(`/ai-usage/summary?days=${days}`, { token }),

  analyzeDocument: (token: string, caseId: string, file: File, title?: string) => {
    const form = new FormData();
    form.append('file', file);
    const qs = title ? `?title=${encodeURIComponent(title)}` : '';
    return request<KnowledgeItem>(`/cases/${caseId}/documents/analyze${qs}`, {
      method: 'POST',
      token,
      body: form,
    });
  },

  extractDates: (token: string, caseId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<DateSuggestionItem[]>(`/cases/${caseId}/documents/extract-dates`, {
      method: 'POST',
      token,
      body: form,
    });
  },

  getBatchAnalyses: (token: string, caseId: string) =>
    request<Array<{ id: string; summary: string; createdAt: string }>>(`/cases/${caseId}/documents/batch-analyses`, { token }),

  analyzeSelectedDocuments: (token: string, caseId: string, documentIds: string[]) =>
    request<BatchAnalysisResult>(`/cases/${caseId}/documents/analyze-batch`, {
      method: 'POST', token, body: JSON.stringify({ documentIds }),
    }),

  analyzeIntakeDocuments: (token: string, intakeId: string, documentIds: string[]) =>
    request<BatchAnalysisResult>(`/intake/${intakeId}/documents/analyze-batch`, {
      method: 'POST', token, body: JSON.stringify({ documentIds }),
    }),

  analyzeDraftFiles: (token: string, files: File[]) => {
    const body = new FormData();
    files.forEach((file) => body.append('files', file));
    return request<BatchAnalysisResult>('/documents/analyze-batch', { method: 'POST', token, body });
  },

  analyzeExistingDocument: (token: string, caseId: string, documentId: string) =>
    request<KnowledgeItem>(`/cases/${caseId}/documents/${documentId}/analyze`, {
      method: 'POST',
      token,
    }),

  extractDatesFromDocument: (token: string, caseId: string, documentId: string) =>
    request<DateSuggestionItem[]>(`/cases/${caseId}/documents/${documentId}/extract-dates`, {
      method: 'POST',
      token,
    }),

  getDateSuggestions: (token: string, caseId: string, status?: string) => {
    const qs = status ? `?status=${status}` : '';
    return request<DateSuggestionItem[]>(`/cases/${caseId}/date-suggestions${qs}`, { token });
  },

  confirmDateSuggestion: (
    token: string,
    caseId: string,
    id: string,
    overrides: { expectedUpdatedAt?: string; label?: string; date?: string; eventType?: string; assigneeId?: string },
  ) =>
    request<DateSuggestionItem>(`/cases/${caseId}/date-suggestions/${id}/confirm`, {
      method: 'POST',
      token,
      body: JSON.stringify(overrides),
    }),

  dismissDateSuggestion: (token: string, caseId: string, id: string) =>
    request<DateSuggestionItem>(`/cases/${caseId}/date-suggestions/${id}/dismiss`, {
      method: 'POST',
      token,
    }),

  uploadDocument: (
    token: string,
    caseId: string,
    file: File,
    meta?: { category?: string; documentDate?: string; tags?: string[] },
  ) => {
    const form = new FormData();
    form.append('file', file);
    if (meta?.category) form.append('category', meta.category);
    if (meta?.documentDate) form.append('documentDate', meta.documentDate);
    if (meta?.tags?.length) form.append('tags', meta.tags.join(','));
    return request<DocumentItem>(`/cases/${caseId}/documents`, {
      method: 'POST',
      token,
      body: form,
    }).then((document) => {
      announceDocumentUpload('case', caseId, document);
      return document;
    });
  },

  uploadDocumentVersion: (token: string, caseId: string, documentId: string, file: File, notes?: string) => {
    const form = new FormData();
    form.append('file', file);
    if (notes) form.append('notes', notes);
    return request<DocumentItem>(`/cases/${caseId}/documents/${documentId}/versions`, {
      method: 'POST',
      token,
      body: form,
    }).then((document) => {
      announceDocumentUpload('case', caseId, document);
      return document;
    });
  },

  getIntakeDocuments: (token: string, intakeId: string) =>
    request<DocumentItem[]>(`/intake/${intakeId}/documents`, { token }),

  uploadIntakeDocument: (token: string, intakeId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<DocumentItem>(`/intake/${intakeId}/documents`, {
      method: 'POST',
      token,
      body: form,
    }).then((document) => {
      announceDocumentUpload('intake', intakeId, document);
      return document;
    });
  },

  updateIntakeDocumentCategory: (token: string, intakeId: string, documentId: string, category: string) =>
    request<DocumentItem>(`/intake/${intakeId}/documents/${documentId}/metadata`, {
      method: 'PATCH', token, body: JSON.stringify({ category }),
    }),

  classifyIntakeChecklist: (
    token: string,
    intakeId: string,
    documentIds: string[],
    labels: string[],
  ) =>
    request<ChecklistClassificationSuggestion[]>(
      `/intake/${intakeId}/documents/classify-checklist`,
      {
        method: 'POST',
        token,
        body: JSON.stringify({ documentIds, labels }),
      },
    ),

  classifyCaseChecklist: (token: string, caseId: string, documentIds: string[], labels: string[]) =>
    request<ChecklistClassificationSuggestion[]>(`/cases/${caseId}/documents/classify-checklist`, {
      method: 'POST',
      token,
      body: JSON.stringify({ documentIds, labels }),
    }),

  downloadIntakeDocument: (token: string, intakeId: string, documentId: string, version?: number) => {
    const qs = version ? `?version=${version}` : '';
    return fetchBlob(`/intake/${intakeId}/documents/${documentId}/download${qs}`, { token });
  },

  deleteIntakeDocument: (token: string, intakeId: string, documentId: string) =>
    request(`/intake/${intakeId}/documents/${documentId}`, { method: 'DELETE', token }),

  updateIntakeDocumentVisibility: (token: string, intakeId: string, documentId: string, visibleToClient: boolean) =>
    request<DocumentItem>(`/intake/${intakeId}/documents/${documentId}/visibility`, {
      method: 'PATCH',
      token,
      body: JSON.stringify({ visibleToClient }),
    }),

  downloadDocument: (
    token: string,
    caseId: string,
    documentId: string,
    version?: number,
  ) => {
    const qs = version ? `?version=${version}` : '';
    return fetchBlob(`/cases/${caseId}/documents/${documentId}/download${qs}`, { token });
  },

  updateDocumentVisibility: (token: string, caseId: string, documentId: string, visibleToClient: boolean) =>
    request<DocumentItem>(`/cases/${caseId}/documents/${documentId}/visibility`, {
      method: 'PATCH',
      token,
      body: JSON.stringify({ visibleToClient }),
    }),

  getDocumentTemplates: (token: string, caseTypeId?: string) => {
    const qs = caseTypeId ? `?caseTypeId=${caseTypeId}` : '';
    return request<DocumentTemplateItem[]>(`/document-templates${qs}`, { token });
  },

  renderTemplate: (token: string, caseId: string, templateId: string) =>
    request<{ name: string; content: string; variables: Record<string, string>; missingFields: string[] }>(
      `/cases/${caseId}/document-templates/${templateId}/render`,
      { token },
    ),

  generateTemplateDocx: (token: string, caseId: string, templateId: string) =>
    request<{ documentId: string; filename: string }>(
      `/cases/${caseId}/document-templates/${templateId}/generate`,
      { method: 'POST', token, silent: true },
    ),

  calculateTravel: (token: string, destination: string, origin?: string) => {
    const query = new URLSearchParams({ destination });
    if (origin) query.set('origin', origin);
    return request<TravelResult>(`/travel/calculate?${query}`, { token });
  },

  // --- Outlook / Microsoft Graph (self-service mailbox connect) ---
  getOutlookConnections: (token: string) =>
    request<MailboxConnectionItem[]>('/outlook/connections', { token }),

  getOutlookConnectUrl: (token: string) =>
    request<{ url: string }>('/outlook/connect', { token }),

  disconnectOutlook: (token: string, id: string) =>
    request<{ revoked: boolean }>(`/outlook/connections/${id}`, { method: 'DELETE', token }),

  syncOutlookNow: (token: string, id: string) =>
    request<{ messagesSynced: number }>(`/outlook/connections/${id}/sync`, { method: 'POST', token }),

  getLineStatus: (token: string) =>
    request<LineIntegrationStatus>('/integrations/line/status', { token }),

  getLinePersonalStatus: (token: string) =>
    request<LinePersonalStatus>('/integrations/line/me', { token }),

  createLineLinkCode: (token: string) =>
    request<LineLinkCodeResponse>('/integrations/line/me/link-code', {
      method: 'POST',
      token,
    }),

  disconnectLine: (token: string) =>
    request<{ ok: boolean }>('/integrations/line/me', {
      method: 'DELETE',
      token,
    }),

  testLineIntegration: (token: string) =>
    request<{ ok: boolean; mode: 'push' | 'none' }>('/integrations/line/test', {
      method: 'POST',
      token,
    }),

  getParticipants: (token: string, caseId: string) =>
    request<CaseParticipantItem[]>(`/cases/${caseId}/participants`, { token }),

  createParticipant: (token: string, caseId: string, data: Record<string, unknown>) =>
    request<CaseParticipantItem>(`/cases/${caseId}/participants`, {
      method: 'POST',
      token,
      body: JSON.stringify(data),
    }),

  updateParticipant: (token: string, caseId: string, participantId: string, data: Record<string, unknown>) =>
    request<CaseParticipantItem>(`/cases/${caseId}/participants/${participantId}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify(data),
    }),

  deleteParticipant: (token: string, caseId: string, participantId: string) =>
    request(`/cases/${caseId}/participants/${participantId}`, { method: 'DELETE', token }),

  getIntakes: (
    token: string,
    params?: {
      status?: string;
      stage?: string;
      page?: number;
      limit?: number;
      followUpOwnerId?: string;
      followUpOverdue?: boolean;
      stalledDays?: number;
    },
  ) => {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.stage) query.set('stage', params.stage);
    if (params?.followUpOwnerId) query.set('followUpOwnerId', params.followUpOwnerId);
    if (params?.followUpOverdue) query.set('followUpOverdue', 'true');
    if (params?.stalledDays != null) query.set('stalledDays', String(params.stalledDays));
    if (params?.page != null) query.set('page', String(params.page));
    if (params?.limit != null) query.set('limit', String(params.limit));
    const qs = query.toString();
    return request<{ items: IntakeItem[]; total: number; page: number; limit: number }>(
      `/intake${qs ? `?${qs}` : ''}`,
      { token },
    );
  },

  getUnlinkedIntakeCount: (token: string) =>
    request<{ count: number }>('/intake/unlinked/count', { token }),

  convertUnlinkedIntakes: (token: string) =>
    request<{ converted: number; failed: number; remaining: number }>('/intake/convert-unlinked', {
      method: 'POST',
      token,
    }),

  getIntake: (token: string, id: string) =>
    request<IntakeItem>(`/intake/${id}`, { token }),

  createIntake: (token: string, data: Record<string, unknown>) =>
    request<IntakeItem>('/intake', { method: 'POST', token, body: JSON.stringify(data) }),

  updateIntake: (token: string, id: string, data: Record<string, unknown>) =>
    request<IntakeItem>(`/intake/${id}`, { method: 'PATCH', token, body: JSON.stringify(data) }),

  getIntakeCargoClaim: (token: string, id: string) =>
    request<CargoClaimItem | null>(`/intake/${id}/cargo-claim`, { token }),

  enableIntakeCargoClaim: (token: string, id: string, data: CargoClaimInput = {}) =>
    request<CargoClaimItem>(`/intake/${id}/cargo-claim`, {
      method: 'POST', token, body: JSON.stringify(data),
    }),

  updateIntakeCargoClaim: (token: string, id: string, data: CargoClaimInput) =>
    request<CargoClaimItem>(`/intake/${id}/cargo-claim`, {
      method: 'PATCH', token, body: JSON.stringify(data),
    }),

  updateIntakeCargoRequirement: (
    token: string,
    id: string,
    requirementId: string,
    data: Partial<Pick<CargoDocumentRequirementItem, 'required' | 'status' | 'note' | 'documentId'>>,
  ) => request<CargoDocumentRequirementItem>(`/intake/${id}/cargo-claim/requirements/${requirementId}`, {
    method: 'PATCH', token, body: JSON.stringify(data),
  }),

  assessIntake: (token: string, id: string, data: Record<string, unknown>) =>
    request<IntakeItem>(`/intake/${id}/assess`, { method: 'POST', token, body: JSON.stringify(data) }),

  decideIntake: (token: string, id: string, data: Record<string, unknown>) =>
    request<IntakeItem>(`/intake/${id}/decide`, { method: 'POST', token, body: JSON.stringify(data) }),

  noticeIntake: (token: string, id: string, data: Record<string, unknown>) =>
    request<IntakeItem>(`/intake/${id}/notice`, { method: 'POST', token, body: JSON.stringify(data) }),

  draftNoticeIntake: (token: string, id: string, analysisId?: string) =>
    request<{ content: string }>(`/intake/${id}/notice/draft`, {
      method: 'POST',
      token,
      body: JSON.stringify(analysisId ? { analysisId } : {}),
    }),

  convertIntake: (token: string, id: string, data?: Record<string, unknown>) =>
    request<IntakeItem>(`/intake/${id}/convert`, { method: 'POST', token, body: JSON.stringify(data ?? {}) }),

  // --- Email intake ---
  getEmailThreads: (token: string) => request<EmailThreadListItem[]>('/email-intake/threads', { token }),

  getEmailThread: (token: string, threadId: string) =>
    request<EmailThreadDetail>(`/email-intake/threads/${threadId}`, { token }),

  acceptEmailThread: (token: string, threadId: string, data?: { clientId?: string; relatedCaseId?: string }) =>
    request<IntakeItem>(`/email-intake/threads/${threadId}/accept`, {
      method: 'POST',
      token,
      body: JSON.stringify(data ?? {}),
    }),

  mockReplyEmailThread: (token: string, threadId: string, data: { bodyText: string; fromName?: string; fromAddress?: string }) =>
    request<EmailMessageItem>(`/email-intake/threads/${threadId}/mock-reply`, {
      method: 'POST',
      token,
      body: JSON.stringify(data),
    }),

  resolveFieldProposal: (
    token: string,
    intakeId: string,
    proposalId: string,
    data: { action: 'confirm' | 'reject'; overrideValue?: string },
  ) =>
    request<IntakeFieldProposalItem>(`/email-intake/intakes/${intakeId}/field-proposals/${proposalId}`, {
      method: 'POST',
      token,
      body: JSON.stringify(data),
    }),

  // --- Document review rounds ---
  getReviewEligibleMembers: (token: string, caseId: string, documentId: string) =>
    request<{ id: string; firstName: string; lastName: string; email: string }[]>(
      `/cases/${caseId}/documents/${documentId}/review-rounds/eligible-members`,
      { token },
    ),

  getReviewRounds: (token: string, caseId: string, documentId: string) =>
    request<ReviewRoundItem[]>(`/cases/${caseId}/documents/${documentId}/review-rounds`, { token }),

  getReviewRound: (token: string, caseId: string, documentId: string, roundId: string) =>
    request<ReviewRoundItem>(`/cases/${caseId}/documents/${documentId}/review-rounds/${roundId}`, { token }),

  createReviewRound: (
    token: string,
    caseId: string,
    documentId: string,
    data: { documentVersionId: string; reviewerIds: string[]; editorIds?: string[]; approvalRule?: 'ALL' | 'ANY_ONE'; scope?: string; dueAt?: string },
  ) =>
    request<ReviewRoundItem>(`/cases/${caseId}/documents/${documentId}/review-rounds`, {
      method: 'POST',
      token,
      body: JSON.stringify(data),
    }),

  recordReviewDecision: (
    token: string,
    caseId: string,
    documentId: string,
    roundId: string,
    data: { action: 'approve' | 'return'; reason?: string; reviewedDocumentVersionId: string },
  ) =>
    request<ReviewRoundItem>(`/cases/${caseId}/documents/${documentId}/review-rounds/${roundId}/decision`, {
      method: 'POST',
      token,
      body: JSON.stringify(data),
    }),

  uploadIntakeAttachment: (token: string, intakeId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<IntakeAttachmentItem>(`/intake/${intakeId}/attachments`, {
      method: 'POST',
      token,
      body: form,
    });
  },

  deleteIntakeAttachment: (token: string, intakeId: string, attachmentId: string) =>
    request(`/intake/${intakeId}/attachments/${attachmentId}`, { method: 'DELETE', token }),

  getTaskDetail: (token: string, taskId: string) =>
    request<TaskDetail>(`/tasks/${taskId}`, { token }),

  updateAnyTask: (token: string, task: { id: string; caseId?: string | null }, data: Record<string, unknown>) =>
    request<TaskItem>(taskUpdatePath(task), { method: 'PATCH', token, body: JSON.stringify(data) }),

  createSubtask: (
    token: string,
    taskId: string,
    data: { title: string; assigneeId?: string; dueDate?: string; priority?: string },
  ) => request<TaskItem>(`/tasks/${taskId}/subtasks`, { method: 'POST', token, body: JSON.stringify(data) }),

  uploadTaskAttachment: (token: string, taskId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<TaskAttachmentItem>(`/tasks/${taskId}/attachments`, { method: 'POST', token, body: form });
  },

  deleteTaskAttachment: (token: string, taskId: string, attachmentId: string) =>
    request(`/tasks/${taskId}/attachments/${attachmentId}`, { method: 'DELETE', token }),

  addTaskComment: (token: string, taskId: string, body: string) =>
    request<TaskCommentItem>(`/tasks/${taskId}/comments`, { method: 'POST', token, body: JSON.stringify({ body }) }),

  deleteTaskComment: (token: string, taskId: string, commentId: string) =>
    request(`/tasks/${taskId}/comments/${commentId}`, { method: 'DELETE', token }),

  summarizeResearchDocuments: (token: string, attachmentIds: string[], intakeId?: string, caseId?: string) =>
    request<IntakePrecedentAnalysisItem>('/intake/research/summary', { method: 'POST', token, body: JSON.stringify({ attachmentIds, intakeId, caseId }) }),
  summarizeCase: (token: string, caseId: string) =>
    request<IntakePrecedentAnalysisItem>(`/intake/research/cases/${caseId}/summary`, { method: 'POST', token }),
  research: (token: string, text: string, intakeId?: string, attachmentIds: string[] = [], factsOnly = false, caseId?: string) =>
    request<IntakePrecedentAnalysisItem>(`/intake/research${factsOnly ? '/facts' : ''}`, { method: 'POST', token, body: JSON.stringify({ text, intakeId, attachmentIds, caseId }) }),
  listResearch: (token: string) => request<IntakePrecedentAnalysisItem[]>('/intake/research', { token }),
  reviewResearchFact: (token: string, analysisId: string, index: number, fact: ResearchFact, statement: string, status: ResearchFact['status']) =>
    request<IntakePrecedentAnalysisItem>(`/intake/research/${analysisId}/facts/${index}`, { method: 'PATCH', token, body: JSON.stringify({ statement, status, expectedStatement: fact.statement, expectedStatus: fact.status }) }),

  runPrecedentAnalysis: (token: string, intakeId: string, attachmentIds?: string[]) =>
    request<IntakePrecedentAnalysisItem>(`/intake/${intakeId}/precedent-analysis`, {
      method: 'POST',
      token,
      body: JSON.stringify({ attachmentIds }),
    }),

  listPrecedentAnalyses: (token: string, intakeId: string) =>
    request<IntakePrecedentAnalysisItem[]>(`/intake/${intakeId}/precedent-analysis`, { token }),

  getPrecedentAnalysis: (token: string, intakeId: string, analysisId: string) =>
    request<IntakePrecedentAnalysisItem>(`/intake/${intakeId}/precedent-analysis/${analysisId}`, { token }),

  listCasePrecedentAnalyses: (token: string, caseId: string) =>
    request<IntakePrecedentAnalysisItem[]>(`/cases/${caseId}/precedent-analysis`, { token }),

  listPortalSubmissions: (token: string) =>
    request<PortalSubmissionStaffEntry[]>('/intake/portal-submissions', { token }),

  convertPortalSubmission: (token: string, submissionId: string, officePlannedDate?: string) =>
    request<IntakeItem>(`/intake/portal-submissions/${submissionId}/convert`, {
      method: 'POST',
      token,
      body: JSON.stringify(officePlannedDate ? { officePlannedDate } : {}),
    }),

  createClosingEmailDraft: (token: string, caseId: string, selectedActivityIds: string[]) =>
    request<ClosingEmailDraft>(`/cases/${caseId}/closing-email-drafts`, {
      method: 'POST',
      token,
      body: JSON.stringify({ selectedActivityIds }),
    }),

  listClosingEmailDrafts: (token: string, caseId: string) =>
    request<ClosingEmailDraft[]>(`/cases/${caseId}/closing-email-drafts`, { token }),

  updateClosingEmailDraft: (
    token: string,
    caseId: string,
    draftId: string,
    data: { subject?: string; bodyText?: string },
  ) =>
    request<ClosingEmailDraft>(`/cases/${caseId}/closing-email-drafts/${draftId}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify(data),
    }),

  approveClosingEmailDraft: (token: string, caseId: string, draftId: string) =>
    request<ClosingEmailDraft>(`/cases/${caseId}/closing-email-drafts/${draftId}/approve`, {
      method: 'POST',
      token,
    }),

  listContactCaseAccess: (token: string, caseId: string) =>
    request<ContactCaseAccessEntry[]>(`/cases/${caseId}/contact-access`, { token }),

  grantContactCaseAccess: (token: string, caseId: string, clientContactId: string, endDate?: string) =>
    request<ContactCaseAccessEntry>(`/cases/${caseId}/contact-access`, {
      method: 'POST',
      token,
      body: JSON.stringify({ clientContactId, ...(endDate ? { endDate } : {}) }),
    }),

  revokeContactCaseAccess: (token: string, caseId: string, accessId: string) =>
    request(`/cases/${caseId}/contact-access/${accessId}`, { method: 'DELETE', token }),

  listDocumentPublications: (token: string, caseId: string, documentId: string) =>
    request<DocumentPublicationEntry[]>(`/cases/${caseId}/documents/${documentId}/publications`, { token }),

  publishDocument: (
    token: string,
    caseId: string,
    documentId: string,
    data: { title?: string; summary?: string; recipientContacts?: string[] },
  ) =>
    request<DocumentPublicationEntry>(`/cases/${caseId}/documents/${documentId}/publications`, {
      method: 'POST',
      token,
      body: JSON.stringify(data),
    }),

  unpublishDocument: (token: string, caseId: string, documentId: string, publicationId: string) =>
    request(`/cases/${caseId}/documents/${documentId}/publications/${publicationId}`, {
      method: 'DELETE',
      token,
    }),
};

export interface BillingInvoiceItem {
  id: string;
  invoiceNumber: string;
  plan: string;
  amount: number;
  status: string;
  paidAt?: string | null;
  createdAt: string;
  payments: Array<{ id: string; status: string; amount: number }>;
}

export interface LineIntegrationStatus {
  configured: boolean;
  channelId: string | null;
  hasStaticAccessToken: boolean;
  pushTargetCount: number;
  deliveryMode: 'push' | 'none';
}

export interface LinePersonalStatus {
  connected: boolean;
  connectedAt: string | null;
  pendingLinkCode: string | null;
  pendingLinkExpiresAt: string | null;
  officialAccountUrl: string | null;
}

export interface LineLinkCodeResponse {
  code: string;
  expiresAt: string;
  officialAccountUrl: string | null;
}


/** A case field the document analysis can offer a value for. */
export type SuggestibleField =
  | 'title'
  | 'opposingParty'
  | 'courtName'
  | 'incidentDate'
  | 'claimedAmount'
  | 'estimatedDamage'
  | 'assuredName'
  | 'shipperName'
  | 'consigneeName'
  | 'contractingCarrierName'
  | 'actualCarrierName'
  | 'origin'
  | 'destination'
  | 'transportMode'
  | 'transportDocumentNumber'
  | 'arrivalDate'
  | 'lossDate'
  | 'goodsDescription'
  | 'movementTerm'
  | 'damageDescription'
  | 'damagedWeight'
  | 'currency';

/**
 * A value read out of the uploaded documents, with the sentence it came from.
 * Never applied on its own — the excerpt is what a lawyer checks it against.
 */
export interface FieldSuggestion {
  field: SuggestibleField;
  /** ISO instant for dates, a plain decimal for amounts, otherwise the text. */
  value: string;
  sourceFilename: string | null;
  sourceExcerpt: string;
}

export interface BatchAnalysisResult {
  summary: string;
  sources: string[];
  truncatedFiles: string[];
  fieldSuggestions?: FieldSuggestion[];
}

export interface TravelResult {
  distanceMeters: number;
  durationSeconds: number;
  mapsUrl: string;
  warning?: string;
  fromCache: boolean;
}

export interface KnowledgeCitationItem {
  id: string;
  documentVersion: number;
  page: number | null;
  statement: string;
  quote: string;
  document: { id: string; filename: string; version: number };
}

export interface AiUsageBucket {
  runs: number;
  inputTokens: number;
  outputTokens: number;
  estimatedUsd: number;
}

export interface AiUsageSummary {
  days: number;
  total: AiUsageBucket;
  errors: number;
  byOperation: Array<AiUsageBucket & { key: string }>;
  byModel: Array<AiUsageBucket & { key: string }>;
  byCase: Array<AiUsageBucket & { caseId: string; ownRef: string | null; title: string | null }>;
}

export interface KnowledgeFlagItem {
  type: 'CONFLICT' | 'MISSING';
  description: string;
}

export interface KnowledgeItem {
  document?: { id: string; filename: string; version: number } | null;
  id: string;
  title: string;
  summary: string;
  category: string;
  createdAt: string;
  case: { id: string; ownRef: string; title: string };
  createdBy: { firstName: string; lastName: string };
  reviewedBy?: { firstName: string; lastName: string } | null;
  reviewedAt?: string | null;
  flags?: KnowledgeFlagItem[] | null;
  citations?: KnowledgeCitationItem[];
}

export interface DateSuggestionItem {
  id: string;
  caseId: string;
  documentId?: string | null;
  label: string;
  suggestedDate: string;
  eventType: 'COURT_DATE' | 'CLIENT_MEETING' | 'DEADLINE' | 'OTHER';
  /** Only DOCUMENT suggestions quote a source; a rule-derived date has none. */
  sourceExcerpt: string | null;
  source: 'DOCUMENT' | 'RULE';
  deadlineRule?: { label: string; trigger: DeadlineTriggerValue } | null;
  status: 'PENDING' | 'CONFIRMED' | 'DISMISSED';
  calendarEventId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type DeadlineTriggerValue = import('@lawfirm/shared').DeadlineTrigger;

export interface DocumentVersionItem {
  id: string;
  version: number;
  filename: string;
  mimeType: string;
  status: 'DRAFT' | 'WAITING_REVIEW' | 'RETURNED_FOR_CHANGES' | 'APPROVED' | 'SUPERSEDED';
  notes: string | null;
  createdById: string | null;
  createdAt: string;
}

export interface DocumentItem {
  id: string;
  filename: string;
  mimeType: string;
  version: number;
  /** หมวดเอกสาร — ค่าจาก DocumentCategory, ค่าเริ่มต้นคือ OTHER (ไม่ใช่ null) */
  category?: string;
  documentDate?: string | null;
  tags?: string[];
  visibleToClient: boolean;
  createdAt: string;
  uploadedBy: { firstName: string; lastName: string };
  versions?: DocumentVersionItem[];
}

/** AI suggestion that an intake file matches an expected-document checklist label. */
export interface ChecklistClassificationSuggestion {
  documentId: string;
  filename: string;
  label: string;
  source: 'ai';
  sourceExcerpt: string;
}

export interface DocumentPublicationEntry {
  id: string;
  documentId: string;
  publishedAt: string;
  unpublishedAt: string | null;
  title?: string | null;
  summary?: string | null;
  documentVersion: { version: number };
}

export interface DocumentTemplateItem {
  id: string;
  name: string;
  description?: string | null;
}

export interface TimeEntryItem {
  id: string;
  hours: number;
  rate: number;
  description?: string;
  date: string;
  user: { firstName: string; lastName: string };
}

export interface TimeSuggestion {
  sourceKey: string;
  source: 'event' | 'task' | 'review' | 'messages';
  caseId: string;
  caseRef: string | null;
  description: string;
  hours: number | null;
  date: string;
}

export interface ConfirmTimeEntryInput {
  caseId: string;
  hours: number;
  description: string;
  date: string;
  sourceKey?: string;
  billable?: boolean;
}

export interface FirmTimesheetEntry {
  id: string;
  date: string;
  hours: number;
  description: string | null;
  billable: boolean;
  caseId: string;
  caseRef: string | null;
  userId: string;
  userName: string;
  invoiced: boolean;
}

export interface FirmTimesheetTotal {
  userId: string;
  userName: string;
  hours: number;
  billableHours: number;
}

export interface FirmTimesheetResponse {
  entries: FirmTimesheetEntry[];
  totals: FirmTimesheetTotal[];
}

export interface InvoiceItem {
  id: string;
  invoiceNumber: string;
  status: string;
  totalAmount: number;
  /** ลูกค้าที่ถูกวางบิล — ว่างได้ในใบเก่าที่ออกก่อนแยกลูกค้าออกจากลูกความ */
  billToCustomer?: { id: string; name: string } | null;
}

export interface InvoicePrintData {
  id: string;
  invoiceNumber: string;
  status: string;
  totalAmount: number;
  issuedAt: string | null;
  dueAt: string | null;
  lineItems: { description: string; quantity: number; unitPrice: number; amount: number }[];
  timeEntries: { description?: string | null; hours: number; rate: number; amount: number }[];
  expenses: { description: string; amount: number }[];
  billToCustomer?: {
    id: string;
    name: string;
    taxId?: string | null;
    branch?: string | null;
    address?: string | null;
    billingEmail?: string | null;
    billingPhone?: string | null;
  } | null;
  case?: { ownRef: string; title: string } | null;
  intake?: { title: string | null } | null;
}

export interface InvoiceDraft {
  timeEntries: {
    id: string;
    date: string;
    description?: string | null;
    hours: number;
    rate: number;
    amount: number;
    userName: string;
  }[];
  expenses: { id: string; date: string; description: string; category?: string | null; amount: number }[];
  /** ค่าจ้างที่ตกลงไว้กับคดี ใช้ตั้งต้นเมื่อยังไม่มีบันทึกเวลา */
  agreedFee: number | null;
}

export interface CreateInvoiceInput {
  lineItems?: { description: string; quantity: number; unitPrice: number }[];
  timeEntryIds?: string[];
  expenseIds?: string[];
  /** ใบที่ออกเปล่าไม่มีงานให้อ้างลูกค้า จึงระบุตรง ๆ */
  billToCustomerId?: string;
  dueAt?: string;
  /** แบ่งบิลหลายราย — ไม่ส่งมาจะใช้ลูกค้าของคดีตามสัดส่วนที่บันทึกไว้ */
  splits?: { customerId: string; sharePercent: number }[];
}

export interface PortalSubmissionStaffEntry {
  id: string;
  referenceNumber: string;
  title: string;
  detail: string;
  submittedAt: string;
  urgencyFlag: boolean;
  clientContact: { name: string; email: string | null };
  client: { name: string };
}

export interface ContactCaseAccessEntry {
  id: string;
  caseId: string;
  clientContactId: string;
  grantedAt: string;
  startDate?: string;
  endDate: string | null;
  revokedAt: string | null;
  notes?: string | null;
  clientContact: { name: string; email: string | null };
}

export interface ClosingEmailDraft {
  id: string;
  caseId: string;
  subject: string;
  bodyText: string;
  recipientKind: 'CLIENT' | 'CUSTOMER';
  recipientClientId: string | null;
  recipientClient?: { id: string; name: string } | null;
  selectedActivityIds: string[];
  missingDataNotes: string[];
  status: 'DRAFT' | 'APPROVED';
  createdAt: string;
}
