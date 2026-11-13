import React, { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePathname, useSegments } from 'expo-router';
import { useAuth } from '@/api/auth';
import { isFeedbackEligible, patternFromSegments, shouldShowFeedback } from '@/lib/app-feedback';
import { PageFeedbackSheet } from './PageFeedbackSheet';

function day() {
  const date = new Date();
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function PageFeedbackHost() {
  const { user } = useAuth();
  const path = usePathname();
  const segments = useSegments() as string[];
  const segmentKey = segments.join('/');
  const [sheetRoute, setSheetRoute] = useState<string | null>(null);

  useEffect(() => {
    setSheetRoute(null);
    if (!user?.id || user.firmRole === 'EXTERNAL' || !isFeedbackEligible(segments, path)) return;
    let active = true;
    const pattern = patternFromSegments(segments, path);
    const prefix = `app-feedback:${user.id}:${user.firmId ?? ''}`;
    const key = `${prefix}:${pattern}`;
    const daily = `${prefix}:day`;
    const visit = (async () => {
      const record = JSON.parse(await AsyncStorage.getItem(key) || '{}') as { visits?: number; asked?: number };
      const visits = (record.visits ?? 0) + 1;
      await AsyncStorage.setItem(key, JSON.stringify({ ...record, visits }));
      return { ...record, visits };
    })();
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const record = await visit;
          const lastDay = await AsyncStorage.getItem(daily);
          const now = Date.now();
          if (!active || !shouldShowFeedback(record.visits, record.asked ?? null, lastDay, now, day(), false)) return;
          // Show first, then record: leaving mid-write must not spend the quota on a sheet nobody saw.
          setSheetRoute(pattern);
          await AsyncStorage.setItem(key, JSON.stringify({ visits: record.visits, asked: now }));
          await AsyncStorage.setItem(daily, day());
        } catch {
          // Storage failures suppress the prompt rather than interrupting work.
        }
      })();
    }, 1500);
    void visit.catch(() => undefined);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [path, segmentKey, user?.id, user?.firmId, user?.firmRole]);

  return sheetRoute ? <PageFeedbackSheet route={sheetRoute} onClose={() => setSheetRoute(null)} /> : null;
}
