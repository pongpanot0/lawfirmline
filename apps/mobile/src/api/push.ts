import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { api } from './client';

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
  } catch {
    // Push is best-effort; never block the app on it.
  }
}
