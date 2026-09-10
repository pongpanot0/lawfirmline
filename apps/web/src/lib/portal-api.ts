import { withFirmSlugHeaders } from './firm-slug';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

function parseApiErrorMessage(body: unknown, fallback: string): string {
  const payload = body as { message?: string | { message?: string } };
  if (typeof payload.message === 'string') return payload.message;
  if (payload.message && typeof payload.message === 'object' && payload.message.message) {
    return payload.message.message;
  }
  return fallback;
}

export class PortalApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, options: RequestInit & { token?: string } = {}): Promise<T> {
  const { token, ...fetchOptions } = options;
  const headers: HeadersInit = withFirmSlugHeaders({
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  });
  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, { ...fetchOptions, headers, cache: 'no-store' });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new PortalApiError(res.status, parseApiErrorMessage(body, res.statusText));
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

async function requestBlob(path: string, token: string): Promise<Blob> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new PortalApiError(res.status, parseApiErrorMessage(body, res.statusText));
  }
  return res.blob();
}

// No Content-Type header here on purpose — the browser sets the multipart
// boundary itself when the body is a FormData instance.
async function requestMultipart<T>(path: string, formData: FormData, token: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new PortalApiError(res.status, parseApiErrorMessage(body, res.statusText));
  }
  return res.json();
}

export interface PortalContact {
  id: string;
  name: string;
  email: string | null;
  hasPassword: boolean;
  client: { id: string; name: string } | null;
}

export interface PortalHearing {
  id: string;
  title: string;
  startAt: string;
}

export interface PortalCaseSummary {
  id: string;
  ownRef: string;
  title: string;
  status: string;
  courtName: string | null;
  openedAt: string;
  nextHearing: PortalHearing | null;
}

export interface PortalCaseDetail extends PortalCaseSummary {
  nextHearing: { id: string; title: string; startAt: string } | null;
  documents: Array<{ id: string; filename: string; mimeType: string; createdAt: string }>;
  invoices: Array<{
    id: string;
    invoiceNumber: string;
    status: string;
    totalAmount: number;
    issuedAt: string | null;
    dueAt: string | null;
    lineItems: Array<{ id: string; description: string; quantity: number; unitPrice: number; amount: number }>;
  }>;
}

export interface CaseMessageEntry {
  id: string;
  senderType: 'STAFF' | 'CONTACT';
  senderUserId: string | null;
  senderContactId: string | null;
  body: string;
  createdAt: string;
}

export interface PortalIntakeSubmissionEntry {
  id: string;
  referenceNumber: string;
  title: string;
  submittedAt: string;
  withdrawnByClient: boolean;
  externalStatus: string;
  attachments: Array<{ id: string; filename: string; size: number; createdAt?: string }>;
  firmDocuments: Array<{ id: string; filename: string; mimeType: string; createdAt: string }>;
}

export interface PortalIntakeSubmissionDetail extends PortalIntakeSubmissionEntry {
  detail: string;
  urgencyFlag: boolean;
  clientRequestedDate: string | null;
}

export interface PortalDashboardActivityItem {
  type: 'document' | 'message' | 'hearing';
  caseId: string;
  caseTitle: string;
  label: string;
  occurredAt: string;
}

export interface PortalDashboardDocument {
  documentId: string;
  caseId: string;
  caseTitle: string;
  filename: string;
  mimeType: string;
  publishedAt: string;
}

export interface PortalDashboardSummary {
  activeCases: number;
  totalCases: number;
  nextHearing: (PortalHearing & { caseId: string; courtName: string | null }) | null;
  pendingDocuments: number;
  unreadMessages: number;
  recentActivity: PortalDashboardActivityItem[];
  recentDocuments: PortalDashboardDocument[];
}

export interface PortalInvitePreview {
  contactName: string;
  contactEmail: string | null;
  clientName: string;
  expiresAt: string;
}

export interface PortalLineStatus {
  connected: boolean;
  connectedAt: string | null;
  pendingLinkCode: string | null;
  pendingLinkExpiresAt: string | null;
  officialAccountUrl: string | null;
}

export interface PortalLineLinkCode {
  code: string;
  expiresAt: string;
  officialAccountUrl: string | null;
}

export interface PortalNotificationPreference {
  channel: 'EMAIL' | 'LINE';
  isEnabled: boolean;
}

export const portalApi = {
  requestLink: (email: string) =>
    request<{ message: string; linkToken?: string }>('/client-portal/auth/request-link', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  loginWithPassword: (email: string, password: string) =>
    request<{
      accessToken: string;
      contact: { id: string; name: string; email: string | null; hasPassword: boolean };
      client: { id: string; name: string };
    }>('/client-portal/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  setPassword: (token: string, password: string) =>
    request<{ hasPassword: true }>('/client-portal/auth/set-password', {
      method: 'POST',
      token,
      body: JSON.stringify({ password }),
    }),

  verify: (token: string) =>
    request<{
      accessToken: string;
      contact: { id: string; name: string; email: string | null; hasPassword: boolean };
      client: { id: string; name: string };
    }>('/client-portal/auth/verify', { method: 'POST', body: JSON.stringify({ token }) }),

  getMe: (token: string) => request<PortalContact>('/client-portal/me', { token }),

  getDashboardSummary: (token: string) =>
    request<PortalDashboardSummary>('/client-portal/dashboard', { token }),

  getCases: (token: string) => request<PortalCaseSummary[]>('/client-portal/cases', { token }),

  getInvite: (token: string) => request<PortalInvitePreview>(`/client-portal/invites/${token}`),

  acceptInvite: (token: string) =>
    request<{
      accessToken: string;
      contact: { id: string; name: string; email: string | null; hasPassword: boolean };
      client: { id: string; name: string };
    }>(`/client-portal/invites/${token}/accept`, { method: 'POST' }),

  getCase: (token: string, id: string) =>
    request<PortalCaseDetail>(`/client-portal/cases/${id}`, { token }),

  downloadDocument: (token: string, documentId: string) =>
    requestBlob(`/client-portal/documents/${documentId}/download`, token),

  getCaseMessages: (token: string, caseId: string) =>
    request<CaseMessageEntry[]>(`/client-portal/cases/${caseId}/messages`, { token }),

  sendCaseMessage: (token: string, caseId: string, body: string) =>
    request<CaseMessageEntry>(`/client-portal/cases/${caseId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ body }),
      token,
    }),

  submitIntake: (
    token: string,
    dto: { title: string; detail: string; clientRequestedDate?: string; urgencyFlag?: boolean },
    files: File[] = [],
  ) => {
    const formData = new FormData();
    formData.append('title', dto.title);
    formData.append('detail', dto.detail);
    if (dto.clientRequestedDate) formData.append('clientRequestedDate', dto.clientRequestedDate);
    if (dto.urgencyFlag !== undefined) formData.append('urgencyFlag', String(dto.urgencyFlag));
    for (const file of files) formData.append('files', file);

    return requestMultipart<PortalIntakeSubmissionEntry>('/client-portal/intake', formData, token);
  },

  getMyIntakeSubmissions: (token: string) =>
    request<PortalIntakeSubmissionEntry[]>('/client-portal/intake', { token }),

  getMyIntakeSubmission: (token: string, submissionId: string) =>
    request<PortalIntakeSubmissionDetail>(`/client-portal/intake/${submissionId}`, { token }),

  downloadIntakeAttachment: (token: string, submissionId: string, attachmentId: string) =>
    requestBlob(`/client-portal/intake/${submissionId}/attachments/${attachmentId}/download`, token),

  downloadIntakeFirmDocument: (token: string, submissionId: string, documentId: string) =>
    requestBlob(`/client-portal/intake/${submissionId}/firm-documents/${documentId}/download`, token),

  getLineStatus: (token: string) =>
    request<PortalLineStatus>('/client-portal/integrations/line/me', { token }),

  createLineLinkCode: (token: string) =>
    request<PortalLineLinkCode>('/client-portal/integrations/line/me/link-code', {
      method: 'POST',
      token,
    }),

  disconnectLine: (token: string) =>
    request<{ ok: boolean }>('/client-portal/integrations/line/me', {
      method: 'DELETE',
      token,
    }),

  getNotificationPreferences: (token: string) =>
    request<PortalNotificationPreference[]>('/client-portal/integrations/notifications', {
      token,
    }),

  updateNotificationPreference: (
    token: string,
    dto: { channel: 'EMAIL' | 'LINE'; isEnabled: boolean },
  ) =>
    request<PortalNotificationPreference>('/client-portal/integrations/notifications', {
      method: 'PATCH',
      body: JSON.stringify(dto),
      token,
    }),
};
