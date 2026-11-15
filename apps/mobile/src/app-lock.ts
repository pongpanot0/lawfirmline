import { useSyncExternalStore } from 'react';
import * as SecureStore from 'expo-secure-store';

/** Per-device choice: the biometric/passcode app lock is off until the person turns it on in บัญชี. */
const KEY = 'app-lock-enabled';

let enabled: boolean | null = null; // null until read from the device
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

void SecureStore.getItemAsync(KEY).then((v) => { enabled = v === '1'; emit(); }).catch(() => { enabled = false; emit(); });

export async function setAppLockEnabled(value: boolean): Promise<void> {
  await SecureStore.setItemAsync(KEY, value ? '1' : '0');
  enabled = value;
  emit();
}

/** null while loading, then the saved choice. */
export function useAppLockEnabled(): boolean | null {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => enabled);
}
