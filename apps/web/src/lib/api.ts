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
      headers: { 'Content-Type': 'application/json' },
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
  options: RequestInit & { token?: string } = {},
): Promise<T> {
  const { token, ...fetchOptions } = options;
  const isFormData = fetchOptions.body instanceof FormData;
  const headers: HeadersInit = {
    ...(!isFormData ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers ?? {}),
  };
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

  if (res.status === 204) return undefined as T;
  return res.json();
}

async function fetchBlob(
  path: string,
  options: RequestInit & { token?: string } = {},
): Promise<Blob> {
  const { token, ...fetchOptions } = options;
  const headers: HeadersInit = { ...(options.headers ?? {}) };
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
}

export interface WorkloadSummary {
  userId: string;
  firstName: string;
  lastName: string;
  leadCount: number;
  buddyCount: number;
  nearDeadlineCount: number;
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

export interface PairingEntry {
  userAId: string;
  userAName: string;
  userBId: string;
  userBName: string;
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
  case?: { id: string; ownRef: string; title: string; courtName?: string | null };
}

export interface CaseItem {
  id: string;
  ownRef: string;
  customerRef?: string | null;
  folderId?: string;
  title: string;
  status: import('@lawfirm/shared').CaseStatus;
  clientId?: string | null;
  clientName?: string | null;
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

export interface CaseMessageEntry {
  id: string;
  senderType: 'STAFF' | 'CONTACT';
  senderUserId: string | null;
  senderContactId: string | null;
  body: string;
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

export interface CaseTypeItem {
  id: string;
  name: string;
  description?: string | null;
  fieldSchema?: Array<{ key: string; label: string; type: string; required?: boolean; options?: string[] }> | null;
  isActive: boolean;
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
  user: { id: string; firstName: string; lastName: string; role?: string };
  paidBy?: { firstName: string; lastName: string } | null;
  case?: { id: string; ownRef: string; title: string; courtName?: string | null } | null;
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

export interface TaskItem {
  id: string;
  title: string;
  description?: string | null;
  status: import('@lawfirm/shared').TaskStatus;
  dueDate?: string | null;
  createdById?: string;
  assignee?: { id: string; firstName: string; lastName: string } | null;
  assignmentLogs?: Array<{
    action: import('@lawfirm/shared').TaskLogAction;
    note?: string | null;
    stageDueDate?: string | null;
    createdAt: string;
    fromUser?: { firstName: string; lastName: string } | null;
    toUser: { firstName: string; lastName: string };
  }>;
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
    monthlyRevenue: number;
    totalNetProfit: number;
  };
  caseProfits: CaseProfitRow[];
  recentCases: Array<{
    id: string;
    ownRef: string;
    title: string;
    status: string;
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
  netProfit: number;
  caseProfits: CaseProfitRow[];
  pettyCashBalance: number;
  pendingCount: number;
  expenseCount: number;
}

export interface FirmInvoiceItem {
  id: string;
  invoiceNumber: string;
  status: string;
  totalAmount: number;
  dueAt?: string | null;
  ownRef: string;
  clientName: string;
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
  matterType?: string | null;
  opposingParty?: string | null;
  incidentDate?: string | null;
  description?: string | null;
  estimatedDamage?: number | null;
  status: string;
  decision: string;
  caseStrength?: string | null;
  assessmentNotes?: string | null;
  decisionNotes?: string | null;
  noticeIssuedAt?: string | null;
  noticeRecipient?: string | null;
  noticeDeadline?: string | null;
  noticeResult?: string | null;
  noticeContent?: string | null;
  attachments?: IntakeAttachmentItem[];
  receivedBy?: { id: string; firstName: string; lastName: string };
  assessor?: { id: string; firstName: string; lastName: string } | null;
  client?: { id: string; name: string } | null;
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

export interface IntakePrecedentItem {
  dekaId: string;
  headnote: string;
  citedStatutes: string[];
  courtLevel: string | null;
  judgmentDate: string | null;
  sourceUrl: string;
}

export interface IntakePrecedentAnalysisItem {
  extractedFacts?: { selectedAttachments?: Array<{ id: string; filename: string }>; attachmentWarnings?: string[] };
  id: string;
  status: 'PENDING' | 'COMPLETE' | 'FAILED';
  precedents: IntakePrecedentItem[];
  summaryBullets: string;
  noticeFacts: string;
  creditsCost: number;
  createdAt: string;
  errorMessage?: string | null;
}

export const api = {
  login: (email: string, password: string) =>
    request<import('@lawfirm/shared').LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
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

  acceptInvitation: (data: Record<string, string>) =>
    request<import('@lawfirm/shared').LoginResponse>('/saas/invitations/accept', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getOmiseConfig: () =>
    request<{ publicKey: string | null; mockMode: boolean }>('/saas/omise/public-key'),

  getMe: (token: string) =>
    request<import('@lawfirm/shared').AuthUser>('/auth/me', { token }),

  getDashboardStats: (token: string) =>
    request<DashboardStats>('/dashboard/stats', { token }),

  getReportsSummary: (token: string) =>
    request<ReportsSummary>('/reports/summary', { token }),

  getFinanceSummary: (token: string) =>
    request<FinanceSummary>('/finance/summary', { token }),

  getFirmInvoices: (token: string) =>
    request<FirmInvoiceItem[]>('/invoices', { token }),

  getCases: (
    token: string,
    params?: { status?: string; search?: string; caseTypeId?: string },
  ) => {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.search) query.set('search', params.search);
    if (params?.caseTypeId) query.set('caseTypeId', params.caseTypeId);
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

  closeCase: (token: string, id: string, closingSummary: string) =>
    request<CaseItem>(`/cases/${id}/close`, {
      method: 'POST',
      token,
      body: JSON.stringify({ closingSummary }),
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

  startTaskOnHold: (
    token: string,
    caseId: string,
    taskId: string,
    data: { reason: string; followerUserId?: string; nextFollowUpAt?: string },
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

  getMyTodos: (token: string) => request<TaskItem[]>('/todos', { token }),

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
    request<{ id: string; expiresAt: string }>('/client-portal/invites', {
      method: 'POST',
      token,
      body: JSON.stringify({ clientContactId }),
    }),

  getCourts: (token: string, activeOnly = true) =>
    request<CourtItem[]>(`/courts?activeOnly=${activeOnly}`, { token }),

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

  sendCaseMessage: (token: string, caseId: string, body: string) =>
    request<CaseMessageEntry>(`/cases/${caseId}/messages`, {
      method: 'POST',
      token,
      body: JSON.stringify({ body }),
    }),

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
    request('/case-types', { method: 'POST', token, body: JSON.stringify(data) }),

  updateCaseType: (token: string, id: string, data: Record<string, unknown>) =>
    request(`/case-types/${id}`, { method: 'PATCH', token, body: JSON.stringify(data) }),

  getExpenses: (token: string, status?: string) => {
    const qs = status ? `?status=${status}` : '';
    return request<ExpenseItem[]>(`/expenses${qs}`, { token });
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

  getDocuments: (token: string, caseId: string) =>
    request<DocumentItem[]>(`/cases/${caseId}/documents`, { token }),

  getTimeEntries: (token: string, caseId: string) =>
    request<TimeEntryItem[]>(`/cases/${caseId}/billing/time-entries`, { token }),

  getInvoices: (token: string, caseId: string) =>
    request<InvoiceItem[]>(`/cases/${caseId}/billing/invoices`, { token }),

  getExpenseSummary: (token: string, caseId: string) =>
    request<{ totalSpent: number; revenue: number; profit: number }>(
      `/cases/${caseId}/billing/summary`,
      { token },
    ),

  createStandaloneExpense: (token: string, data: Record<string, unknown>) =>
    request('/expenses', { method: 'POST', token, body: JSON.stringify(data) }),

  getPettyCash: (token: string) =>
    request<{ balance: number }>('/petty-cash', { token }),

  getCaseKnowledge: (token: string, caseId: string) =>
    request<KnowledgeItem[]>(`/cases/${caseId}/knowledge`, { token }),

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
    overrides: { label?: string; date?: string; eventType?: string },
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

  uploadDocument: (token: string, caseId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<DocumentItem>(`/cases/${caseId}/documents`, {
      method: 'POST',
      token,
      body: form,
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
    });
  },

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
    request<{ name: string; content: string }>(
      `/cases/${caseId}/document-templates/${templateId}/render`,
      { token },
    ),

  calculateTravel: (token: string, destination: string, origin?: string) => {
    const query = new URLSearchParams({ destination });
    if (origin) query.set('origin', origin);
    return request<TravelResult>(`/travel/calculate?${query}`, { token });
  },

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
    request<{ ok: boolean; mode: 'push' | 'broadcast' | 'none' }>('/integrations/line/test', {
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

  getIntakes: (token: string, params?: { status?: string; page?: number; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.page != null) query.set('page', String(params.page));
    if (params?.limit != null) query.set('limit', String(params.limit));
    const qs = query.toString();
    return request<{ items: IntakeItem[]; total: number; page: number; limit: number }>(
      `/intake${qs ? `?${qs}` : ''}`,
      { token },
    );
  },

  getIntake: (token: string, id: string) =>
    request<IntakeItem>(`/intake/${id}`, { token }),

  createIntake: (token: string, data: Record<string, unknown>) =>
    request<IntakeItem>('/intake', { method: 'POST', token, body: JSON.stringify(data) }),

  updateIntake: (token: string, id: string, data: Record<string, unknown>) =>
    request<IntakeItem>(`/intake/${id}`, { method: 'PATCH', token, body: JSON.stringify(data) }),

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

  publishDocument: (token: string, caseId: string, documentId: string, data: { title?: string; summary?: string }) =>
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
  deliveryMode: 'push' | 'broadcast';
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
  | 'estimatedDamage';

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

export interface KnowledgeItem {
  document?: { id: string; filename: string } | null;
  id: string;
  title: string;
  summary: string;
  category: string;
  createdAt: string;
  case: { id: string; ownRef: string; title: string };
  createdBy: { firstName: string; lastName: string };
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
}

export type DeadlineTriggerValue = import('@lawfirm/shared').DeadlineTrigger;

export interface DocumentItem {
  id: string;
  filename: string;
  mimeType: string;
  version: number;
  visibleToClient: boolean;
  createdAt: string;
  uploadedBy: { firstName: string; lastName: string };
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

export interface InvoiceItem {
  id: string;
  invoiceNumber: string;
  status: string;
  totalAmount: number;
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
  selectedActivityIds: string[];
  missingDataNotes: string[];
  status: 'DRAFT' | 'APPROVED';
  createdAt: string;
}
