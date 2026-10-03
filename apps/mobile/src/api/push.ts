import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { api } from './client';

/** The token this device registered under the signed-in user, kept so logout can drop it. */
let registeredToken: string | null = null;

/**
 * Register this device for push. Silently a no-op where push cannot work:
 * simulators, and Expo Go (SDK 53+ removed remote push there — a dev build
 * is required). Real delivery therefore only happens on built binaries.
 */
export async function registerForPush(): Promise<void> {
  try {
    if (!Device.isDevice) return;
    const { status } = await Notifications.getPermissionsAsync();
    let granted = status === 'granted';
    if (!granted) {
      const req = await Notifications.requestPermissionsAsync();
      granted = req.status === 'granted';
    }
    if (!granted) return;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'การแจ้งเตือน',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }

    const token = (await Notifications.getExpoPushTokenAsync()).data;
    await api('/notifications/devices', {
      method: 'POST',
      body: { token, platform: Platform.OS === 'ios' ? 'ios' : 'android' },
    });
    registeredToken = token;
  } catch {
    // Push is best-effort; never block the app on it.
  }
}

/**
 * Stop pushing the signed-out user's work to this device. Must run while the
 * session is still valid; a failure is ignored because the server also moves
 * the token to whoever signs in next.
 */
export async function unregisterPush(): Promise<void> {
  const token = registeredToken;
  registeredToken = null;
  await Notifications.setBadgeCountAsync(0).catch(() => undefined);
  if (!token) return;
  await Promise.race([
    api(`/notifications/devices/${encodeURIComponent(token)}`, { method: 'DELETE' }).catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ]);
}

/** Whether the OS lets this app show notifications at all. */
export async function pushPermission(): Promise<'granted' | 'denied' | 'undetermined' | 'unsupported'> {
  if (!Device.isDevice) return 'unsupported';
  const { status } = await Notifications.getPermissionsAsync();
  return status;
}
