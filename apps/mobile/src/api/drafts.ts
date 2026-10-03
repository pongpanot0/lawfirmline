import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import type { AuthUserInfo } from './types';
import type { CaseRef } from '@/components/CasePicker';
import type { AttachmentFile } from '@/components/Attachments';

export function draftScope(user: AuthUserInfo) {
  return `mobile-draft:${user.firmId ?? ''}:${user.id}:`;
}

export interface ExpenseDraft {
  savedExpenseId?: string;
  id: string;
  category: string;
  description: string;
  amount: string;
  date: string;
  caseRef: CaseRef | null;
  sourceEventId?: string;
  receiptUri: string | null;
  receiptMimeType?: string;
}

export async function listExpenseDrafts(scope: string): Promise<ExpenseDraft[]> {
  const keys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(`${scope}expense:`));
  const rows = await AsyncStorage.multiGet(keys);
  return rows.flatMap(([, value]) => value ? [JSON.parse(value) as ExpenseDraft] : []);
}

export async function retainReceipt(scope: string, id: string, uri: string) {
  if (!FileSystem.documentDirectory) throw new Error('อุปกรณ์นี้ยังเก็บใบเสร็จไม่ได้');
  const dir = `${FileSystem.documentDirectory}${encodeURIComponent(scope)}/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  const target = `${dir}${id}-${Date.now()}.jpg`;
  await FileSystem.copyAsync({ from: uri, to: target });
  return target;
}

// Serialize writes so an earlier keystroke cannot replace a later one.
const writes = new Map<string, Promise<void>>();
function writeInOrder(key: string, action: () => Promise<void>): Promise<void> {
  const next = (writes.get(key) ?? Promise.resolve()).catch(() => {}).then(action);
  writes.set(key, next);
  void next.finally(() => { if (writes.get(key) === next) writes.delete(key); }).catch(() => {});
  return next;
}
export function saveDraft(key: string, value: unknown): Promise<void> {
  const text = JSON.stringify(value);
  return writeInOrder(key, () => AsyncStorage.setItem(key, text));
}

export async function removeExpenseDraft(scope: string, draft: ExpenseDraft) {
  await writeInOrder(`${scope}expense:${draft.id}`, () => AsyncStorage.removeItem(`${scope}expense:${draft.id}`));
  if (draft.receiptUri) await FileSystem.deleteAsync(draft.receiptUri, { idempotent: true });
}

export function taskDraftScope(user: AuthUserInfo) { return `${draftScope(user)}task:${user.firmRole}:`; }
export interface TaskDraftData { files: AttachmentFile[] }
export interface TaskDraftMeta { name: string; route: string }
interface TaskDraftRecord<T extends TaskDraftData = TaskDraftData> extends TaskDraftMeta {
  version: 1; savedAt: string; data: T;
}
const retained = new Map<string, Map<string, string>>();
function taskDirectory(key: string) {
  if (!FileSystem.documentDirectory) throw new Error('อุปกรณ์นี้ยังเก็บร่างไม่ได้');
  return `${FileSystem.documentDirectory}task-drafts/${encodeURIComponent(key)}/`;
}
function parseTaskDraft<T extends TaskDraftData>(text: string): TaskDraftRecord<T> {
  const row = JSON.parse(text) as TaskDraftRecord<T>;
  if (row?.version !== 1 || !row.data || !Array.isArray(row.data.files) || typeof row.name !== 'string' ||
    typeof row.route !== 'string' || !/^(?:\/task\/(?:new|blocker)|\/document-template|\/document-waiting|\/invoice\/[0-9a-f-]{36})(?:\?|$)/.test(row.route) || typeof row.savedAt !== 'string') {
    throw new Error('อ่านร่างไม่ได้ กรุณาลองโหลดอีกครั้ง');
  }
  return row;
}

/** Save the file bytes before committing the record; picker cache URIs do not survive reliably. */
export function saveTaskDraft<T extends TaskDraftData>(key: string, data: T, meta: TaskDraftMeta) {
  const snapshot = JSON.parse(JSON.stringify(data)) as T;
  return writeInOrder(key, async () => {
    const dir = taskDirectory(key);
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    const copies = retained.get(key) ?? new Map<string, string>(); retained.set(key, copies);
    const files: AttachmentFile[] = [];
    for (const file of snapshot.files) {
      let uri = file.uri.startsWith(dir) ? file.uri : copies.get(file.uri);
      if (uri && !(await FileSystem.getInfoAsync(uri)).exists) uri = undefined;
      if (!uri) {
        uri = `${dir}${Date.now()}-${Math.random().toString(36).slice(2)}${file.name.match(/\.[a-z0-9]{1,10}$/i)?.[0] ?? ''}`;
        await FileSystem.copyAsync({ from: file.uri, to: uri });
        copies.set(file.uri, uri);
      }
      files.push({ ...file, uri });
    }
    await AsyncStorage.setItem(key, JSON.stringify({ version: 1, savedAt: new Date().toISOString(), ...meta, data: { ...snapshot, files } }));
    // Only prune our own folder, after the new record is durable.
    for (const filename of await FileSystem.readDirectoryAsync(dir).catch(() => [] as string[])) {
      const uri = `${dir}${filename}`;
      if (!files.some(file => file.uri === uri)) await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
    }
  });
}
export async function loadTaskDraft<T extends TaskDraftData>(key: string) {
  await (writes.get(key) ?? Promise.resolve()).catch(() => {});
  const text = await AsyncStorage.getItem(key);
  if (!text) return null;
  const row = parseTaskDraft<T>(text), files: AttachmentFile[] = [], missingFiles: string[] = [];
  const dir = taskDirectory(key);
  for (const file of row.data.files) {
    if (typeof file?.uri !== 'string' || !file.uri.startsWith(dir) || typeof file.name !== 'string' || typeof file.mimeType !== 'string') {
      throw new Error('ไฟล์ในร่างไม่ถูกต้อง กรุณาตรวจร่างก่อนทำต่อ');
    }
    if ((await FileSystem.getInfoAsync(file.uri)).exists) files.push(file);
    else missingFiles.push(file.name);
  }
  return { data: { ...row.data, files }, missingFiles };
}
export function removeTaskDraft(key: string) {
  return writeInOrder(key, async () => {
    await AsyncStorage.removeItem(key);
    await FileSystem.deleteAsync(taskDirectory(key), { idempotent: true });
    retained.delete(key);
  });
}
export async function listTaskDrafts(scope: string) {
  await Promise.all([...writes].filter(([key]) => key.startsWith(scope)).map(([, write]) => write.catch(() => {})));
  const keys = (await AsyncStorage.getAllKeys()).filter(key => key.startsWith(scope));
  const rows = await AsyncStorage.multiGet(keys);
  return rows.flatMap(([key, text]) => text ? [{ key, ...parseTaskDraft(text) }] : [])
    .map(({ key, name, route, savedAt }) => ({ key, name, route, savedAt })).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}
