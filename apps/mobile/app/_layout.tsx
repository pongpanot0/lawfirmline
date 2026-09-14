import React, { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { AuthProvider, useAuth } from '@/api/auth';
import { Loading } from '@/components/ui';
import { colors } from '@/theme';

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

  if (!ready) return <Loading />;
  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, maxAge: 7 * 24 * 60 * 60 * 1000 }}
    >
      <AuthProvider>
        <AuthGate>
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: colors.bg },
              headerTintColor: colors.ink,
              headerTitleStyle: { fontWeight: '700' },
              contentStyle: { backgroundColor: colors.bg },
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="(auth)/login" options={{ headerShown: false }} />
            <Stack.Screen name="case/[id]" options={{ title: 'คดี' }} />
            <Stack.Screen
              name="court-day/[eventId]"
              options={{ title: 'Court Day', headerShown: false }}
            />
          </Stack>
        </AuthGate>
      </AuthProvider>
    </PersistQueryClientProvider>
  );
}
