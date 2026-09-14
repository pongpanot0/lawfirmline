import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { API_URL, ApiError, getTokens } from './client';

/**
 * Multipart + binary helpers. These bypass the JSON api() wrapper: uploads
 * send FormData, downloads stream to the cache directory with the auth
 * header attached.
 */

async function authHeader(): Promise<Record<string, string>> {
  const { accessToken } = await getTokens();
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
}

async function postMultipart(path: string, form: FormData) {
  const headers = await authHeader();
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers, // no Content-Type: fetch sets the multipart boundary itself
    body: form,
  });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (typeof body?.message === 'string') message = body.message;
    } catch {
      // keep the status-line message
    }
    throw new ApiError(res.status, message);
  }
  return res.json();
}

export function uploadCaseDocument(
  caseId: string,
  fileUri: string,
  name: string,
  mimeType: string,
) {
  const form = new FormData();
  form.append('file', { uri: fileUri, name, type: mimeType } as unknown as Blob);
  return postMultipart(`/cases/${caseId}/documents`, form);
}

export interface NewExpense {
  amount: number;
  description: string;
  category: string;
  date: string;
  caseId?: string;
  billable?: boolean;
  receiptUri?: string;
}

export function createExpense(expense: NewExpense) {
  const form = new FormData();
  form.append('amount', String(expense.amount));
  form.append('description', expense.description);
  form.append('category', expense.category);
  form.append('date', expense.date);
  if (expense.caseId) form.append('caseId', expense.caseId);
  if (expense.billable !== undefined) form.append('billable', String(expense.billable));
  if (expense.receiptUri) {
    form.append('receipt', {
      uri: expense.receiptUri,
      name: 'receipt.jpg',
      type: 'image/jpeg',
    } as unknown as Blob);
  }
  return postMultipart('/expenses', form);
}

/**
 * Download a case document to the cache (auth header attached) and hand it
 * to the OS share/open sheet. Re-downloads overwrite the same cache path,
 * so a newer version replaces the old file.
 */
export async function openCaseDocument(
  caseId: string,
  documentId: string,
  filename: string,
): Promise<void> {
  const headers = await authHeader();
  const safeName = filename.replace(/[^\w.\-ก-๙ ]+/g, '_') || 'document';
  const target = `${FileSystem.cacheDirectory}${documentId}-${safeName}`;
  const result = await FileSystem.downloadAsync(
    `${API_URL}/cases/${caseId}/documents/${documentId}/download`,
    target,
    { headers },
  );
  if (result.status !== 200) throw new ApiError(result.status, 'ดาวน์โหลดเอกสารไม่สำเร็จ');
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(result.uri);
}
