import React from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '@/api/client';
import { Text } from '@/components/AppText';
import { Button, Card, ErrorState, LoadingState } from '@/components/ui';
import { formatMoney } from '@/format';
import { colors, pageContent, spacing, typeScale } from '@/theme';

interface IntakeDetail {
  title: string | null;
  clientName: string | null;
  client: { name: string } | null;
  description: string | null;
  estimatedDamage: number | null;
  assessmentNotes: string | null;
  caseStrength: string | null;
  case: { id: string; ownRef: string; title: string } | null;
  relatedCase: { id: string; ownRef: string; title: string } | null;
}

/** Secretary results need a read-only destination for matters not yet converted to cases. */
export default function IntakeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const query = useQuery({ queryKey: ['intake', id], queryFn: () => api<IntakeDetail>(`/intake/${encodeURIComponent(id)}`), enabled: !!id, retry: false });
  const intake = query.data;
  const linkedCase = intake?.case ?? intake?.relatedCase;
  return <ScrollView style={styles.screen} contentContainerStyle={pageContent}
    refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => query.refetch()} />}>
    <Stack.Screen options={{ title: 'เรื่องรับใหม่' }} />
    {query.isLoading ? <LoadingState label="กำลังโหลดเรื่องรับใหม่…" /> : query.isError || !intake
      ? <ErrorState message={query.error instanceof ApiError && query.error.status === 404 ? 'ไม่พบเรื่องรับใหม่นี้ หรือคุณไม่มีสิทธิ์เข้าถึง' : 'โหลดเรื่องรับใหม่ไม่สำเร็จ'} onRetry={() => query.refetch()} />
      : <Card style={{ gap: spacing.md }}>
        <Text accessibilityRole="header" style={styles.title}>{intake.title ?? 'เรื่องรับใหม่'}</Text>
        <View><Text style={styles.label}>ลูกความ</Text><Text style={styles.body}>{intake.clientName ?? intake.client?.name ?? 'ไม่มีข้อมูล'}</Text></View>
        {intake.description ? <View><Text style={styles.label}>รายละเอียด</Text><Text selectable style={styles.body}>{intake.description}</Text></View> : null}
        <View><Text style={styles.label}>ความเสียหายประมาณ</Text><Text style={styles.body}>{intake.estimatedDamage != null ? `${formatMoney(intake.estimatedDamage)} บาท` : 'ไม่มีข้อมูล'}</Text></View>
        <View><Text style={styles.label}>ความแข็งแกร่งของคดี</Text><Text style={styles.body}>{intake.caseStrength ?? 'ยังไม่ประเมิน'}</Text></View>
        {intake.assessmentNotes ? <View><Text style={styles.label}>หมายเหตุประเมิน</Text><Text selectable style={styles.body}>{intake.assessmentNotes}</Text></View> : null}
        {linkedCase ? <Button title={`เปิดคดี ${linkedCase.ownRef}`} variant="secondary" onPress={() => router.push(`/case/${linkedCase.id}`)} /> : null}
      </Card>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  title: { ...typeScale.title, color: colors.ink },
  body: { ...typeScale.body, color: colors.text },
  label: { ...typeScale.meta, color: colors.muted },
});
