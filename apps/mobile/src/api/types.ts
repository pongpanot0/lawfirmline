/**
 * Response shapes the mobile app reads. Agenda types come from
 * @lawfirm/shared; the rest mirror what the controllers actually return,
 * trimmed to the fields the screens use.
 */
export type { AgendaItem, AgendaDay, MyDayResponse } from '@lawfirm/shared';

export interface AuthUserInfo {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  firmRole?: string | null;
  firmId?: string;
  firmName?: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUserInfo;
}

export interface DashboardStats {
  stats: {
    totalCases: number;
    openCases: number;
    upcomingEvents: number;
    overdueTasks: number;
    myTasks: number;
  };
  upcomingHearings: Array<{
    id: string;
    title: string;
    startAt: string;
    courtName: string | null;
    case: { ownRef: string; title: string } | null;
  }>;
}

export interface CaseListItem {
  id: string;
  ownRef: string;
  title: string;
  status: string;
  clientName: string | null;
  courtName: string | null;
  blackCaseNumber: string | null;
  leadLawyer?: { id: string; firstName: string; lastName: string } | null;
  updatedAt: string;
}

export interface CaseDetail extends CaseListItem {
  clientName: string | null;
  courtLevel: string;
  caseTypeId?: string | null;
  leadLawyerId?: string;
  assignments?: Array<{ userId: string; assignmentType: string; user: { id: string; firstName: string; lastName: string } }>;
  description: string | null;
  claimedAmount: number | null;
  redCaseNumber: string | null;
  openedAt: string;
  client?: { id: string; name: string; phone?: string | null } | null;
}

export interface TaskItem {
  id: string;
  title: string;
  status: string;
  dueDate: string | null;
  caseId: string | null;
  createdById?: string;
  description?: string | null;
  requiresReview?: boolean;
  recurrenceDays?: number | null;
  blockedById?: string | null;
  followUps?: Array<{ id: string; title: string; status: string; dueDate: string | null; followUpSourceCommentId: string; assignee?: { id: string; firstName: string; lastName: string } | null }>;
  workType?: import('@lawfirm/shared').TaskWorkType | null;
  routine?: import('@lawfirm/shared').TaskRoutineSnapshot | null;
  routineCompletedChecks?: number[];
  updatedAt?: string;
  acknowledgedAt?: string | null;
  assignedAt?: string | null;
  scheduledFor?: string | null;
  planConfirmedAt?: string | null;
  handedOffById?: string | null;
  onHold?: { reason: string; endedAt: string | null } | null;
  assignmentLogs?: Array<{ action: string; note?: string | null; fromUserId?: string | null }>;
  reviewerId?: string | null;
  attachments?: Array<{ id: string; filename: string; size: number; mimeType?: string }>;
  comments?: Array<{ id: string; body: string; kind?: string; createdAt?: string; authorId?: string; author: { firstName: string; lastName: string } }>;
  assigneeId?: string | null;
  assignee?: { id: string; firstName: string; lastName: string } | null;
  case?: { id: string; ownRef: string; title: string; leadLawyerId?: string } | null;
  workflow?: { workflowRun: { id: string; name: string } | null; workflowStep?: number | null; stepsTotal?: number; previousStepHolder?: string | null; previousStepAttachments?: Array<{ id: string; taskId: string; filename: string; size: number }> } | null;
}

export interface CalendarEventItem {
  id: string;
  caseId: string;
  title: string;
  courtName: string | null;
  startAt: string;
  endAt: string | null;
  type: string;
  updatedAt: string;
  assigneeId: string | null;
  assignee?: { id: string; firstName: string; lastName: string } | null;
  assignees?: Array<{ userId: string; user: { id: string; firstName: string; lastName: string } }>;
  case?: { id: string; ownRef: string; title: string } | null;
}

export interface WorkloadMember {
  id: string;
  name: string;
  openTasks: number;
  overdueTasks: number;
  openCases: number;
  hearingsThisWeek: number;
}

export interface WorkloadResponse {
  asOf: string;
  weekEndsAt: string;
  totals: { openTasks: number; overdueTasks: number; hearingsThisWeek: number };
  members: WorkloadMember[];
}

export interface CourtDayChecklistItem {
  id: string;
  title: string;
  done: boolean;
}

export interface CourtDayState {
  checklist: CourtDayChecklistItem[];
  taskIds: string[];
  documents: Array<{ id: string; version: number }>;
  notes: string;
  outcome: string;
  nextHearing: boolean;
  nextTitle: string;
  nextAt: string;
  followUp: boolean;
  taskTitle: string;
  taskDue: string;
  expense: boolean;
  amount: string;
  expenseCategory?: string;
  clientDraft: boolean;
  draftRecipientKind?: 'CLIENT' | 'CUSTOMER';
  draftCustomerId?: string;
}

export interface CourtDayResponse {
  event: CalendarEventItem & {
    case?: { id: string; ownRef: string; title: string; courtName: string | null } | null;
  };
  workspace: {
    eventId: string;
    version: number;
    state: CourtDayState;
    result: string | null;
    completedAt: string | null;
    updatedAt: string | null;
  };
}

export interface OwnerKpis {
  month: string;
  unbilled: { amount: number; caseCount: number; hours: number };
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

export interface LeaveItem {
  id: string;
  userId: string;
  type: 'SICK' | 'PERSONAL' | 'VACATION';
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  startDate: string;
  endDate: string;
  user?: { firstName: string; lastName: string };
  courtConflicts?: Array<{ eventId: string; caseId: string; caseRef: string; title: string; courtName: string | null; startAt: string }>;
}

export interface CollectionInvoice {
  id: string; invoiceNumber: string; status: 'DRAFT' | 'SENT' | 'PAID';
  customerName: string | null; subject: string; caseId: string | null; caseRef: string | null;
  totalAmount: number; paidAmount: number; outstanding: number; issuedAt: string | null; dueAt: string | null;
  daysOverdue: number; lastReminderAt: string | null; updatedAt: string;
  collectionOwner: { id: string; firstName: string; lastName: string } | null;
  collectionNextAt: string | null; collectionNote: string | null;
}

export interface InvoicePaymentItem {
  id: string; invoiceId: string; amount: number; receivedAt: string;
  method: 'TRANSFER' | 'CHEQUE' | 'CASH' | 'OTHER'; note: string | null;
  invoice?: { invoiceNumber: string };
  createRequestId?: string | null;
}

export const PAYMENT_METHOD_LABEL = { TRANSFER: 'โอนเงิน', CHEQUE: 'เช็ค', CASH: 'เงินสด', OTHER: 'อื่น ๆ' } as const;

export interface CollectionDetail extends CollectionInvoice {
  lineItems: Array<{ id: string; description: string; quantity: number; unitPrice: number; amount: number }>;
  payments: InvoicePaymentItem[];
}

export interface UnbilledCase {
  case: { id: string; ownRef: string; title: string; clientName: string | null; leadLawyer: { id: string; firstName: string; lastName: string } };
  amount: number; hours: number; timeEntryIds: string[]; expenseIds: string[];
  lines: Array<{ id: string; kind: string; description: string; amount: number; date: string }>;
}

export interface OwnerFinance {
  month: string;
  totals: { received: number; billed: number; unbilled: number; payable: number; receivable: number };
  receivables: CollectionInvoice[]; billed: CollectionInvoice[]; drafts: CollectionInvoice[];
  receipts: InvoicePaymentItem[]; unbilled: UnbilledCase[];
  payable: Array<{ id: string; claimId: string | null; amount: number; description: string; date: string;
    case: { id: string; ownRef: string } | null; user: { firstName: string; lastName: string } }>;
}

export type NotificationCategory = 'TASK' | 'CASE' | 'COMMENT' | 'CALENDAR' | 'CLIENT' | 'BILLING' | 'LEAVE';

export interface AppNotification {
  id: string;
  category: NotificationCategory;
  title: string;
  body: string | null;
  path: string;
  appPath: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationPreference {
  category: NotificationCategory;
  push: boolean;
  line: boolean;
}
