import React, { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { useFonts, Anuphan_600SemiBold, Anuphan_700Bold } from '@expo-google-fonts/anuphan';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { AuthProvider, useAuth } from '@/api/auth';
import { registerForPush } from '@/api/push';
import { LockGate } from '@/components/LockGate';
import { Loading } from '@/components/ui';
import { colors, fonts } from '@/theme';
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
    shouldSetBadge: false,
  }),
});

function AuthGate({ children }: { children: React.ReactNode }) {
  const { ready, user } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;
    const inAuthGroup = segments[0] === '(auth)';
    if (!user && !inAuthGroup) router.replace('/(auth)/login');
    else if (user && inAuthGroup) router.replace('/(tabs)');
  }, [ready, user, segments, router]);

  // Register the device for push once a session exists.
  useEffect(() => {
    if (user) registerForPush();
  }, [user?.id]);

  // A tapped push carries the in-app route it is about, e.g. /court-day/<id>.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const url = response.notification.request.content.data?.url;
      if (typeof url === 'string' && url.startsWith('/')) router.push(url as never);
    });
    return () => sub.remove();
  }, [router]);

  if (!ready) return <Loading />;
  return <>{children}</>;
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
                headerStyle: { backgroundColor: colors.bg },
                headerTintColor: colors.ink,
                headerBackTitle: 'กลับ',
                headerTitleStyle: { fontFamily: fonts.bold, fontSize: 18 * scale },
                contentStyle: { backgroundColor: colors.bg, paddingBottom: Platform.OS === 'android' ? insets.bottom : 0 },
              }}
            >
              <Stack.Screen name="(tabs)" options={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
              <Stack.Screen name="(auth)/login" options={{ headerShown: false }} />
              <Stack.Screen name="case/[id]" options={{ title: 'คดี' }} />
              <Stack.Screen name="team-week" options={{ title: 'ภาระงานทีม 7 วัน' }} />
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
