import * as FileSystem from 'expo-file-system/legacy';
import { File } from 'expo-file-system';
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

function filePart(uri: string, name: string, type: string) {
  // Expo's fetch accepts File-like parts through bytes(), rather than RN's uri object.
  return { name, type, bytes: () => new File(uri).bytes() } as unknown as Blob;
}

async function postMultipart(path: string, form: FormData) {
  const headers = await authHeader();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers, // no Content-Type: fetch sets the multipart boundary itself
      body: form,
      signal: controller.signal,
    });
  } catch (error) {
    if (__DEV__) console.warn('Samnuan upload failed', error);
    throw new Error(controller.signal.aborted ? 'ส่งไฟล์นานเกินไป กรุณาตรวจการเชื่อมต่อ' : 'เชื่อมต่อไม่ได้ กรุณาตรวจอินเทอร์เน็ต');
  } finally { clearTimeout(timer); }
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
  form.append('file', filePart(fileUri, name, mimeType));
  return postMultipart(`/cases/${caseId}/documents`, form);
}

export function uploadTaskAttachment(taskId: string, file: { uri: string; name: string; mimeType: string }) {
  const form = new FormData();
  form.append('file', filePart(file.uri, file.name, file.mimeType));
  return postMultipart(`/tasks/${taskId}/attachments`, form);
}

export async function openTaskAttachment(taskId: string, attachmentId: string, filename: string) {
  const safeName = filename.replace(/[^\w.\-ก-๙ ]+/g, '_') || 'attachment';
  const result = await FileSystem.downloadAsync(`${API_URL}/tasks/${taskId}/attachments/${attachmentId}/download`,
    `${FileSystem.cacheDirectory}${attachmentId}-${safeName}`, { headers: await authHeader() });
  if (result.status !== 200) throw new ApiError(result.status, 'ดาวน์โหลดไฟล์ไม่สำเร็จ');
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(result.uri);
}

export interface NewExpense {
  amount: number;
  description: string;
  category: string;
  date: string;
  caseId?: string;
  sourceEventId?: string;
  receiptUri?: string;
  receiptMimeType?: string;
}

export function createExpense(expense: NewExpense) {
  const form = new FormData();
  form.append('amount', String(expense.amount));
  form.append('description', expense.description);
  form.append('category', expense.category);
  form.append('date', expense.date);
  if (expense.caseId) form.append('caseId', expense.caseId);
  form.append('status', 'DRAFT');
  if (expense.sourceEventId) form.append('sourceEventId', expense.sourceEventId);
  if (expense.receiptUri) {
    const mime = expense.receiptMimeType ?? 'image/jpeg';
    form.append('receipt', filePart(expense.receiptUri,
      `receipt.${({ 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' } as Record<string, string>)[mime] ?? 'jpg'}`, mime));
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

export async function openExpenseReceipt(id: string, filename: string) {
  const target = `${FileSystem.cacheDirectory}receipt-${id}-${filename.replace(/[^\w.\-ก-๙ ]+/g, '_')}`;
  const result = await FileSystem.downloadAsync(`${API_URL}/expenses/${id}/receipt`, target, { headers: await authHeader() });
  if (result.status !== 200) throw new ApiError(result.status, 'ดาวน์โหลดใบเสร็จไม่สำเร็จ');
  if (!(await Sharing.isAvailableAsync())) throw new Error('อุปกรณ์นี้ยังเปิดใบเสร็จไม่ได้');
  await Sharing.shareAsync(result.uri);
}
