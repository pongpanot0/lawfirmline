import { withFirmSlugHeaders } from './firm-slug';
export interface Workroom { nextCursor: string | null; id: string; title: string; requestedDate: string | null; scopeText: string | null; proposedDate: string | null; agreedDate: string | null; commitmentVersion: number; accepted: boolean; deliveredAt: string | null; deliveryAcknowledgedAt: string | null; withdrawn: boolean; owner: string | null; messages: { id: string; authorId: string; authorKind: string; body: string; filename: string | null; size: number | null; createdAt: string }[]; contacts: { id: string; name: string }[]; contactIds?: string[] }
export async function workroomRequest<T>(token: string, staff: boolean, path: string, body?: object | FormData, file = false): Promise<T> {
  const form = body instanceof FormData;
  const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/${staff ? 'portal-workroom' : 'client-portal/workroom'}${path}`, { method: body ? 'POST' : 'GET', headers: withFirmSlugHeaders({ Authorization: `Bearer ${token}`, ...(!form && body ? { 'Content-Type': 'application/json' } : {}) }), body: form ? body : body ? JSON.stringify(body) : undefined, cache: 'no-store' });
  if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(Array.isArray(data.message) ? data.message.join(', ') : data.message ?? `Request failed (${response.status})`); }
  return file ? await response.blob() as T : await response.json();
}
