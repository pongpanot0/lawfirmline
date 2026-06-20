const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

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
  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...fetchOptions,
    headers,
    cache: 'no-store',
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.message ?? res.statusText);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
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
  case?: { id: string; caseNumber: string; title: string };
}

export interface CaseItem {
  id: string;
  caseNumber: string;
  folderId?: string;
  title: string;
  status: import('@lawfirm/shared').CaseStatus;
  clientName?: string | null;
  courtName?: string | null;
  customFields?: Record<string, unknown> | null;
  leadLawyer: { firstName: string; lastName: string };
  caseType?: { id: string; name: string; fieldSchema?: unknown } | null;
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
  case?: { id: string; caseNumber: string; title: string; courtName?: string | null } | null;
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
  calendarEvents: Array<{
    id: string;
    title: string;
    startAt: string;
    type: string;
  }>;
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
  role: import('@lawfirm/shared').Role;
  stats: {
    totalCases: number;
    openCases: number;
    upcomingEvents: number;
    overdueTasks: number;
    myTasks: number;
    pendingExpenses: number;
  };
  recentCases: Array<{
    id: string;
    caseNumber: string;
    title: string;
    status: string;
    leadLawyer: { firstName: string; lastName: string };
  }>;
  upcomingHearings: Array<{
    id: string;
    title: string;
    startAt: string;
    case: { caseNumber: string; title: string };
  }>;
  pendingReimbursements: ExpenseItem[];
}

export const api = {
  login: (email: string, password: string) =>
    request<import('@lawfirm/shared').LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  getMe: (token: string) =>
    request<import('@lawfirm/shared').AuthUser>('/auth/me', { token }),

  getDashboardStats: (token: string) =>
    request<DashboardStats>('/dashboard/stats', { token }),

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

  getLawyers: (token: string) => request<UserItem[]>('/users/lawyers', { token }),

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
    request<{ totalSpent: number }>(`/cases/${caseId}/billing/summary`, { token }),

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

  testLineIntegration: (token: string) =>
    request<{ ok: boolean; mode: 'push' | 'broadcast' | 'none' }>('/integrations/line/test', {
      method: 'POST',
      token,
    }),
};

export interface LineIntegrationStatus {
  configured: boolean;
  channelId: string | null;
  hasStaticAccessToken: boolean;
  pushTargetCount: number;
  deliveryMode: 'push' | 'broadcast';
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
  case: { id: string; caseNumber: string; title: string };
  createdBy: { firstName: string; lastName: string };
}

export interface DocumentItem {
  id: string;
  filename: string;
  mimeType: string;
  version: number;
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
