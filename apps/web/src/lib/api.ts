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

export interface CalendarEventItem {
  id: string;
  title: string;
  startAt: string;
  endAt?: string | null;
  type: string;
  case?: { id: string; ownRef: string; title: string };
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
  estimatedFee?: number | null;
  closingSummary?: string | null;
  closedAt?: string | null;
  leadLawyer: { firstName: string; lastName: string };
  caseType?: { id: string; name: string; fieldSchema?: unknown } | null;
  client?: { id: string; name: string } | null;
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

export interface CaseDetail extends CaseItem {
  description?: string | null;
  folderId?: string;
  courtName?: string | null;
  customFields?: Record<string, unknown> | null;
  openedAt: string;
  leadLawyer: { firstName: string; lastName: string; email: string };
  assignments: Array<{
    assignmentType: string;
    user: { firstName: string; lastName: string; role: string };
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
  assignee?: { firstName: string; lastName: string } | null;
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
    case: { ownRef: string; title: string };
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

  checkout: (token: string, plan: string, omiseToken?: string, omiseSource?: string) =>
    request<{ success: boolean; plan: string; invoiceId?: string }>('/saas/billing/checkout', {
      method: 'POST',
      token,
      body: JSON.stringify({ plan, omiseToken, omiseSource }),
    }),

  checkoutPromptPay: (token: string, plan: string) =>
    request<{
      invoiceId: string;
      chargeId: string;
      amount: number;
      expiresAt: string;
      paid: boolean;
    }>('/saas/billing/checkout/promptpay', {
      method: 'POST',
      token,
      body: JSON.stringify({ plan }),
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

  getClerks: (token: string) => request<UserItem[]>('/users/clerks', { token }),

  getUsers: (token: string) => request<UserItem[]>('/users', { token }),

  createUser: (token: string, data: Record<string, unknown>) =>
    request('/users', {
      method: 'POST',
      token,
      body: JSON.stringify(data),
    }),

  getTasks: (token: string, caseId: string) =>
    request<TaskItem[]>(`/cases/${caseId}/tasks`, { token }),

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

  createCalendarEvent: (token: string, data: Record<string, unknown>) =>
    request('/calendar/events', {
      method: 'POST',
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
    request(`/cases/${caseId}/documents`, { token }),

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

  uploadDocument: (token: string, caseId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<DocumentItem>(`/cases/${caseId}/documents`, {
      method: 'POST',
      token,
      body: form,
    });
  },

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

export interface TravelResult {
  distanceMeters: number;
  durationSeconds: number;
  mapsUrl: string;
  warning?: string;
  fromCache: boolean;
}

export interface KnowledgeItem {
  id: string;
  title: string;
  summary: string;
  category: string;
  createdAt: string;
  case: { id: string; ownRef: string; title: string };
  createdBy: { firstName: string; lastName: string };
}

export interface DocumentItem {
  id: string;
  filename: string;
  mimeType: string;
  version: number;
  visibleToClient: boolean;
  createdAt: string;
  uploadedBy: { firstName: string; lastName: string };
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
