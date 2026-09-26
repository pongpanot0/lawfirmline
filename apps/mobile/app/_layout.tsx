import React, { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
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

// Cache-first everywhere: render what we have instantly, refetch behind it.
// gcTime must outlive a court day offline, hence 7 days.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      gcTime: 7 * 24 * 60 * 60 * 1000,
      retry: 1,
    },
  },
});

const persister = createAsyncStoragePersister({ storage: AsyncStorage });

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

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, maxAge: 7 * 24 * 60 * 60 * 1000 }}
    >
      <AuthProvider>
        <AuthGate>
          <LockGate>
            <StatusBar style="dark" />
            <Stack
              screenOptions={{
                headerStyle: { backgroundColor: colors.bg },
                headerTintColor: colors.ink,
                headerTitleStyle: { fontFamily: fonts.bold },
                contentStyle: { backgroundColor: colors.bg },
              }}
            >
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="(auth)/login" options={{ headerShown: false }} />
              <Stack.Screen name="case/[id]" options={{ title: 'คดี' }} />
              <Stack.Screen name="notifications" options={{ title: 'การแจ้งเตือน' }} />
              <Stack.Screen name="more" options={{ title: 'อื่น ๆ' }} />
              <Stack.Screen name="clients/index" options={{ title: 'ลูกความ' }} />
              <Stack.Screen name="clients/[id]" options={{ title: 'ลูกความ' }} />
              <Stack.Screen name="expenses/index" options={{ title: 'ค่าใช้จ่าย' }} />
              <Stack.Screen name="expenses/new" options={{ title: 'ค่าใช้จ่ายใหม่' }} />
              <Stack.Screen name="intake/new" options={{ title: 'รับเรื่องใหม่' }} />
              <Stack.Screen name="event/new" options={{ title: 'นัดหมายใหม่' }} />
              <Stack.Screen name="scan/[caseId]" options={{ title: 'สแกนเอกสาร' }} />
              <Stack.Screen name="reports" options={{ title: 'รายงาน' }} />
              <Stack.Screen name="timesheet" options={{ title: 'ยืนยันเวลา' }} />
              <Stack.Screen name="knowledge" options={{ title: 'คลังความรู้' }} />
              <Stack.Screen name="operations" options={{ title: 'งานพักไว้' }} />
              <Stack.Screen
                name="court-day/[eventId]"
                options={{ title: 'Court Day', headerShown: false }}
              />
            </Stack>
          </LockGate>
        </AuthGate>
      </AuthProvider>
    </PersistQueryClientProvider>
  );
}
