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
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(options.headers ?? {}),
  };
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

export interface PortalContact {
  id: string;
  name: string;
  email: string | null;
  client: { id: string; name: string } | null;
}

export interface PortalCaseSummary {
  id: string;
  ownRef: string;
  title: string;
  status: string;
  courtName: string | null;
  openedAt: string;
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

export const portalApi = {
  requestLink: (email: string) =>
    request<{ message: string; linkToken?: string }>('/client-portal/auth/request-link', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  verify: (token: string) =>
    request<{
      accessToken: string;
      contact: { id: string; name: string; email: string | null };
      client: { id: string; name: string };
    }>('/client-portal/auth/verify', { method: 'POST', body: JSON.stringify({ token }) }),

  getMe: (token: string) => request<PortalContact>('/client-portal/me', { token }),

  getCases: (token: string) => request<PortalCaseSummary[]>('/client-portal/cases', { token }),

  getCase: (token: string, id: string) =>
    request<PortalCaseDetail>(`/client-portal/cases/${id}`, { token }),

  downloadDocument: (token: string, documentId: string) =>
    requestBlob(`/client-portal/documents/${documentId}/download`, token),
};
