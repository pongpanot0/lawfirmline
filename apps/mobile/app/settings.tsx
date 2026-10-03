import React, { useCallback, useState } from 'react';
import { AppState, Linking, Pressable, Switch, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Text } from '@/components/AppText';
import { FormPage } from '@/components/Form';
import { Card, ErrorNote, Loading, SectionLabel } from '@/components/ui';
import { TEXT_SIZES, useDisplayPreferences } from '@/components/AppText';
import { api } from '@/api/client';
import { useNotificationPreferences, useUpdateNotificationPreference } from '@/api/hooks';
import { pushPermission, registerForPush } from '@/api/push';
import { CATEGORY_META } from '@/notification-categories';
import { colors, spacing } from '@/theme';

export default function SettingsScreen() {
  const { scale, setScale } = useDisplayPreferences();
  return <FormPage>
    <NotificationSettings />
    <SectionLabel>ขนาดตัวอักษรทั้งแอป</SectionLabel>
    <Text style={{ color: colors.muted }}>เลือกขนาดที่อ่านสบาย · แอปจำค่าบนโทรศัพท์เครื่องนี้</Text>
    <View style={{ gap: spacing.sm }}>
      {TEXT_SIZES.map((value, index) => <Pressable key={value} accessibilityRole="radio"
        accessibilityState={{ selected: scale === value }} onPress={() => setScale(value)}
        style={{ minHeight: 52, padding: spacing.md, backgroundColor: scale === value ? colors.soft : colors.surface,
          borderWidth: 1, borderColor: scale === value ? colors.ink : colors.line, borderRadius: 10 }}>
        <Text style={{ color: colors.ink }}>{scale === value ? '✓ ' : ''}{['ปกติ', 'ใหญ่', 'ใหญ่มาก', 'ใหญ่พิเศษ'][index]}</Text>
      </Pressable>)}
    </View>
    <SectionLabel>ตัวอย่าง</SectionLabel>
    <Card><Text style={{ fontWeight: '700', color: colors.ink, fontSize: 17 }}>นัดศาลวันนี้ 09:00</Text>
      <Text style={{ color: colors.text, marginTop: spacing.sm }}>คนหลัก: ทนายสมชาย · คนรอง: ทนายศิริพร</Text>
      <Text style={{ color: colors.muted, marginTop: spacing.sm }}>ปรับแล้วมีผลกับรายการ ปุ่ม และช่องกรอกทันที</Text></Card>
  </FormPage>;
}

function NotificationSettings() {
  const prefs = useNotificationPreferences();
  const update = useUpdateNotificationPreference();
  const line = useQuery({
    queryKey: ['line-status'],
    queryFn: () => api<{ connected: boolean }>('/integrations/line/me'),
  });
  const [permission, setPermission] = useState<Awaited<ReturnType<typeof pushPermission>>>('granted');

  // Re-read on focus and on return from the OS settings app, where the user may have just allowed it.
  useFocusEffect(useCallback(() => {
    const check = (register: boolean) => pushPermission().then((status) => {
      setPermission(status);
      if (register && status === 'granted') registerForPush();
    }).catch(() => undefined);
    check(false);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check(true);
    });
    return () => sub.remove();
  }, []));

  return <View style={{ gap: spacing.sm }}>
    <SectionLabel>การแจ้งเตือน</SectionLabel>
    <Text style={{ color: colors.muted }}>เลือกว่าเรื่องไหนให้เด้งเข้าแอปหรือส่ง LINE · ทุกเรื่องยังเก็บไว้ในหน้าการแจ้งเตือนเสมอ</Text>
    {permission === 'denied' ? <Card style={{ borderColor: colors.warnSoft }}>
      <Text style={{ color: colors.warn, fontWeight: '600' }}>เครื่องนี้ปิดการแจ้งเตือนของแอปอยู่</Text>
      <Text style={{ color: colors.muted, marginTop: spacing.xs }}>เปิดในตั้งค่าเครื่องก่อน สวิตช์ "แอป" ด้านล่างจึงจะมีผล</Text>
      <Pressable accessibilityRole="button" onPress={() => Linking.openSettings()} style={{ minHeight: 44, justifyContent: 'center' }}>
        <Text style={{ color: colors.info, fontWeight: '600' }}>เปิดตั้งค่าเครื่อง</Text>
      </Pressable>
    </Card> : null}
    {line.data && !line.data.connected ? <Text style={{ color: colors.muted }}>
      ยังไม่ได้เชื่อม LINE · เชื่อมได้ที่หน้าตั้งค่าบนเว็บ แล้วสวิตช์ LINE จึงจะมีผล
    </Text> : null}
    {prefs.isLoading ? <Loading /> : prefs.isError ? <ErrorNote message="โหลดการตั้งค่าแจ้งเตือนไม่สำเร็จ" onRetry={() => prefs.refetch()} /> : <Card>
      <View style={{ flexDirection: 'row', paddingBottom: spacing.sm }}>
        <Text style={{ flex: 1, color: colors.faint, fontSize: 12 }}>เรื่อง</Text>
        <Text style={{ width: 64, textAlign: 'center', color: colors.faint, fontSize: 12 }}>แอป</Text>
        <Text style={{ width: 64, textAlign: 'center', color: colors.faint, fontSize: 12 }}>LINE</Text>
      </View>
      {prefs.data?.map((row) => {
        const label = CATEGORY_META[row.category]?.label ?? row.category;
        return <View key={row.category} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 48, borderTopWidth: 1, borderTopColor: colors.line }}>
          <Text style={{ flex: 1, color: colors.text }}>{label}</Text>
          <View style={{ width: 64, alignItems: 'center' }}>
            <Switch accessibilityLabel={`${label} แจ้งเตือนในแอป`} value={row.push}
              onValueChange={(push) => update.mutate({ category: row.category, push })} />
          </View>
          <View style={{ width: 64, alignItems: 'center' }}>
            <Switch accessibilityLabel={`${label} ส่ง LINE`} value={row.line}
              onValueChange={(value) => update.mutate({ category: row.category, line: value })} />
          </View>
        </View>;
      })}
    </Card>}
    {update.isError ? <ErrorNote message="บันทึกการตั้งค่าไม่สำเร็จ ลองใหม่อีกครั้ง" /> : null}
  </View>;
}
