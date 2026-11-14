import { useEffect } from 'react';
import { useSegments } from 'expo-router';
import { getAnalytics, logScreenView } from '@react-native-firebase/analytics';

/**
 * Route pattern only ("case/[id]"), never the real path: ids of cases and clients stay out of GA4.
 * Route groups like "(tabs)" are dropped.
 */
export function screenName(segments: string[]): string {
  return segments.filter((s) => !s.startsWith('(')).join('/') || 'home';
}

// Analytics must never break the app (e.g. a build without the Firebase config file).
function safe(fn: () => Promise<unknown>) {
  try {
    fn().catch(() => undefined);
  } catch {
    // Firebase not configured on this build.
  }
}

export function useScreenTracking() {
  const name = screenName(useSegments() as string[]);
  useEffect(() => {
    safe(() => logScreenView(getAnalytics(), { screen_name: name, screen_class: name }));
  }, [name]);
}
