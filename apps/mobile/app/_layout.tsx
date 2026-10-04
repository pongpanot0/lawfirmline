import React, { useEffect, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { useFonts, Anuphan_600SemiBold, Anuphan_700Bold } from '@expo-google-fonts/anuphan';
import { QueryClient, useQueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { AuthProvider, useAuth } from '@/api/auth';
import { registerForPush } from '@/api/push';
import { api } from '@/api/client';
import { invalidateNotifications, useUnreadNotifications } from '@/api/hooks';
import { LockGate } from '@/components/LockGate';
import { Loading, Button } from '@/components/ui';
import { Text } from '@/components/AppText';
import { colors, fonts, spacing } from '@/theme';
import { DisplayPreferences, useDisplayPreferences } from '@/components/AppText';

// Cache-first everywhere: render what we have instantly, refetch behind it.
// gcTime must outlive a court day offline, hence 7 days.
function SessionLayout() {
  const { user } = useAuth();
  const [queryClient] = useState(() => new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      gcTime: 7 * 24 * 60 * 60 * 1000,
      retry: 1,
    },
  },
  }));

  const [persister] = useState(() => createAsyncStoragePersister({
    storage: AsyncStorage,
    key: `mobile-cache:${user?.firmId ?? ''}:${user?.id ?? 'guest'}:${user?.firmRole ?? ''}`,
  }));
  return (
    <PersistQueryClientProvider client={queryClient}
      persistOptions={{ persister, maxAge: 7 * 24 * 60 * 60 * 1000 }}>
      <AuthGate><AppStack /></AuthGate>
    </PersistQueryClientProvider>
  );
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

function AuthGate({ children }: { children: React.ReactNode }) {
  const { ready, user, logout } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;
    const inAuthGroup = segments[0] === '(auth)';
    if (!user && !inAuthGroup) router.replace('/(auth)/login');
    else if (user && !user.firmRole?.includes('EXTERNAL') && inAuthGroup) router.replace('/(tabs)');
  }, [ready, user, segments, router]);

  // Register the device for push once a session exists.
  useEffect(() => {
    if (user && user.firmRole !== 'EXTERNAL') registerForPush();
  }, [user?.id]);

  // A push that lands while the app is open changes the inbox and the bell.
  const queryClient = useQueryClient();
  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener(() => invalidateNotifications(queryClient));
    return () => sub.remove();
  }, [queryClient]);

  // A tapped push carries the in-app route it is about, e.g. /court-day/<id>.
  // The last-response hook also covers a tap that cold-started the app, which
  // fires before any listener could be attached.
  const response = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (!ready || !response) return;
    const key = response.notification.request.identifier;
    if (handledResponse === key) return;
    handledResponse = key;
    Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
    // A tap while signed out was meant for whoever was signed in then; never replay it into the next login.
    if (!user || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const { url, notificationId } = response.notification.request.content.data ?? {};
    if (typeof notificationId === 'string') {
      api(`/notifications/${notificationId}/read`, { method: 'POST' })
        .catch(() => undefined)
        .finally(() => invalidateNotifications(queryClient));
    }
    if (typeof url === 'string' && url.startsWith('/')) router.push(url as never);
  }, [ready, user, response, router, queryClient]);

  if (!ready) return <Loading />;

  if (user?.firmRole === 'EXTERNAL') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.md }}>
        <Text style={{ fontSize: 18, textAlign: 'center', marginBottom: spacing.lg }}>
          บัญชีผู้รับงานภายนอกใช้งานผ่านเว็บ
        </Text>
        <Button
          title="ออกจากระบบ"
          onPress={() => {
            logout().catch(() => undefined);
            router.replace('/(auth)/login');
          }}
        />
      </View>
    );
  }

  return <>{children}{user ? <BadgeSync /> : null}</>;
}

/** Module-level so a re-login (which remounts the session tree) does not replay an old tap. */
let handledResponse: string | null = null;

/** Keeps the app-icon badge equal to the unread inbox count. */
function BadgeSync() {
  const unread = useUnreadNotifications();
  useEffect(() => {
    if (unread.data !== undefined) Notifications.setBadgeCountAsync(unread.data).catch(() => undefined);
  }, [unread.data]);
  return null;
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ Anuphan_600SemiBold, Anuphan_700Bold });
  if (!fontsLoaded) return <Loading />;

  return <SafeAreaProvider><DisplayPreferences><AuthProvider><SessionRoot /></AuthProvider></DisplayPreferences></SafeAreaProvider>;
}

function SessionRoot() {
  const { ready, user } = useAuth();
  if (!ready) return <Loading />;
  return <SessionLayout key={`${user?.firmId}:${user?.id}:${user?.firmRole}`} />;
}

function AppStack() {
  const { scale } = useDisplayPreferences();
  const insets = useSafeAreaInsets();
  return (
          <LockGate>
            <StatusBar style="dark" />
            <Stack
              screenOptions={{
                headerStyle: { backgroundColor: colors.surface },
                headerTintColor: colors.ink,
                headerBackTitle: 'กลับ',
                headerTitleStyle: { fontFamily: fonts.bold, fontSize: 18 * scale },
                contentStyle: { backgroundColor: colors.bg, paddingBottom: Platform.OS === 'android' ? insets.bottom : 0 },
              }}
            >
              <Stack.Screen name="(tabs)" options={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
              <Stack.Screen name="(auth)/login" options={{ headerShown: false }} />
              <Stack.Screen name="(auth)/register" options={{ headerShown: false }} />
              <Stack.Screen name="(auth)/forgot-password" options={{ headerShown: false }} />
              <Stack.Screen name="account" options={{ title: 'บัญชีของฉัน' }} />
              <Stack.Screen name="delete-account" options={{ title: 'ลบบัญชีและข้อมูล' }} />
              <Stack.Screen name="case/[id]" options={{ title: 'คดี' }} />
              <Stack.Screen name="team-week" options={{ title: 'ภาระงานทีม 7 วัน' }} />
              <Stack.Screen name="person/[id]" options={{ title: 'รายละเอียดสมาชิก' }} />
              <Stack.Screen name="owner-decisions" options={{ title: 'คิวตัดสินใจวันนี้' }} />
              <Stack.Screen name="owner-finance" options={{ title: 'เงินสำนักงาน / ลูกหนี้' }} />
              <Stack.Screen name="invoice/[id]" options={{ title: 'ใบแจ้งหนี้ / รับเงิน' }} />
              <Stack.Screen name="document-template" options={{ title: 'สร้างเอกสารจากแบบ' }} />
              <Stack.Screen name="document-waiting" options={{ title: 'รอเอกสารจากภายนอก' }} />
              <Stack.Screen name="task/blocker" options={{ title: 'ส่งจุดติดขัดให้คนแก้' }} />
              <Stack.Screen name="case/[id]/close" options={{ title: 'ปิด / เปิดคดี' }} />
              <Stack.Screen name="notifications" options={{ title: 'การแจ้งเตือน' }} />
              <Stack.Screen name="more" options={{ title: 'อื่น ๆ' }} />
              <Stack.Screen name="clients/index" options={{ title: 'ลูกความ' }} />
              <Stack.Screen name="clients/[id]" options={{ title: 'ลูกความ' }} />
              <Stack.Screen name="expenses/index" options={{ title: 'ค่าใช้จ่าย' }} />
              <Stack.Screen name="expenses/new" options={{ title: 'เพิ่มค่าใช้จ่าย' }} />
              <Stack.Screen name="expenses/claims" options={{ title: 'ชุดเบิก' }} />
              <Stack.Screen name="expenses/claim/[id]" options={{ title: 'รายละเอียดชุดเบิก' }} />
              <Stack.Screen name="leaves" options={{ title: 'ขอลา' }} />
              <Stack.Screen name="intake/new" options={{ title: 'รับเคสใหม่' }} />
              <Stack.Screen name="case/new" options={{ title: 'รับเคสใหม่' }} />
              <Stack.Screen name="task/new" options={{ title: 'เพิ่มงาน' }} />
              <Stack.Screen name="search" options={{ title: 'ค้นหาไฟล์' }} />
              <Stack.Screen name="settings" options={{ title: 'ตั้งค่า' }} />
              <Stack.Screen name="event/new" options={{ title: 'นัดหมายใหม่' }} />
              <Stack.Screen name="event/[id]/team" options={{ title: 'ทีมที่ไปด้วย' }} />
              <Stack.Screen name="scan/[caseId]" options={{ title: 'ถ่ายรูป / แนบไฟล์คดี' }} />
              <Stack.Screen name="reports" options={{ title: 'รายงาน' }} />
              <Stack.Screen name="knowledge" options={{ title: 'คลังความรู้' }} />
              <Stack.Screen name="operations" options={{ title: 'งานพักไว้' }} />
              <Stack.Screen
                name="court-day/[eventId]"
                options={{ title: 'Court Day', headerShown: false, contentStyle: { backgroundColor: colors.bg } }}
              />
            </Stack>
          </LockGate>
  );
}
