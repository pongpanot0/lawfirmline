import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import type { AuthUserInfo } from './types';
import type { CaseRef } from '@/components/CasePicker';

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
export function saveDraft(key: string, value: unknown): Promise<void> {
  const next = (writes.get(key) ?? Promise.resolve()).catch(() => {}).then(() =>
    AsyncStorage.setItem(key, JSON.stringify(value)));
  writes.set(key, next);
  void next.finally(() => { if (writes.get(key) === next) writes.delete(key); }).catch(() => {});
  return next;
}

export async function removeExpenseDraft(scope: string, draft: ExpenseDraft) {
  await AsyncStorage.removeItem(`${scope}expense:${draft.id}`);
  if (draft.receiptUri) await FileSystem.deleteAsync(draft.receiptUri, { idempotent: true });
}
