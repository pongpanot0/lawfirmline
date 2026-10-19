import React, { useCallback, useState } from 'react';
import { AppState, Linking, Pressable, StyleSheet, Switch, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Check } from 'lucide-react-native';
import { Text } from '@/components/AppText';
import { FormPage, FormSection } from '@/components/Form';
import { ActionRow, Card, ErrorState, InlineError, LoadingState } from '@/components/ui';
import { TEXT_SIZES, useDisplayPreferences } from '@/components/AppText';
import { api } from '@/api/client';
import { useNotificationPreferences, useUpdateNotificationPreference } from '@/api/hooks';
import { pushPermission, registerForPush } from '@/api/push';
import { CATEGORY_META } from '@/notification-categories';
import { colors, radius, shadow, spacing } from '@/theme';

const SIZE_LABELS = ['ปกติ', 'ใหญ่', 'ใหญ่มาก', 'ใหญ่พิเศษ'];

export default function SettingsScreen() {
  const router = useRouter();
  const { scale, setScale } = useDisplayPreferences();
  return <FormPage>
    <NotificationSettings />
    <FormSection title="ขนาดตัวอักษรทั้งแอป" detail="เลือกขนาดที่อ่านสบาย · แอปจำค่าบนโทรศัพท์เครื่องนี้">
      <View accessibilityRole="radiogroup" style={styles.sizeTrack}>
        {TEXT_SIZES.map((value, index) => {
          const on = scale === value;
          return <Pressable key={value} accessibilityRole="radio" accessibilityLabel={SIZE_LABELS[index]}
            accessibilityState={{ selected: on, checked: on }} onPress={() => setScale(value)}
            style={({ pressed }) => [styles.size, on && styles.sizeOn, pressed && !on && { backgroundColor: colors.soft }]}>
            <Text style={{ flex: 1, color: on ? colors.ink : colors.muted, fontWeight: on ? '700' : '500' }}>{SIZE_LABELS[index]}</Text>
            {on ? <Check size={18} color={colors.ink} /> : null}
          </Pressable>;
        })}
      </View>
      {/* The preview sits with the control it previews. */}
      <View style={styles.preview}>
        <Text style={{ fontWeight: '700', color: colors.ink, fontSize: 17 }}>นัดศาลวันนี้ 09:00</Text>
        <Text style={{ color: colors.text, marginTop: spacing.sm }}>คนหลัก: ทนายสมชาย · คนรอง: ทนายศิริพร</Text>
        <Text style={{ color: colors.muted, marginTop: spacing.sm, fontSize: 14 }}>ตัวอย่าง · ปรับแล้วมีผลกับรายการ ปุ่ม และช่องกรอกทันที</Text>
      </View>
    </FormSection>
    <FormSection title="บัญชีผู้ใช้">
      <ActionRow title="บัญชีของฉัน" detail="แก้ชื่อและเปลี่ยนรหัสผ่าน" onPress={() => router.push('/account')} />
      <View style={{ borderTopWidth: 1, borderTopColor: colors.divider }}>
        <ActionRow title="ลบบัญชีและข้อมูล" detail="ส่งคำขอและติดตามสถานะ · ยังไม่ลบทันที" destructive onPress={() => router.push('/delete-account' as never)} />
      </View>
    </FormSection>
  </FormPage>;
}

/** One channel toggle: the label and switch share a 44pt target and the category is in the spoken name. */
function ChannelToggle({ label, a11yLabel, value, onChange, disabled = false, dim = false, note }: {
  label: string; a11yLabel: string; value: boolean; onChange: (value: boolean) => void; disabled?: boolean; dim?: boolean; note?: string;
}) {
  return <Pressable accessibilityRole="switch" accessibilityLabel={a11yLabel} accessibilityHint={note}
    accessibilityState={{ checked: value, disabled }} disabled={disabled} onPress={() => onChange(!value)}
    style={({ pressed }) => [styles.toggle, (disabled || dim) && { opacity: 0.5 }, pressed && { opacity: 0.7 }]}>
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={{ color: colors.text }}>{label}</Text>
      {note ? <Text style={{ color: colors.muted, fontSize: 12 }}>{note}</Text> : null}
    </View>
    <Switch accessible={false} importantForAccessibility="no" accessibilityElementsHidden value={value} disabled={disabled}
      trackColor={{ false: colors.line, true: colors.ink }} thumbColor={colors.surface} onValueChange={onChange} />
  </Pressable>;
}

function NotificationSettings() {
  const prefs = useNotificationPreferences();
  const update = useUpdateNotificationPreference();
  const line = useQuery({
    queryKey: ['line-status'],
    queryFn: () => api<{ connected: boolean }>('/integrations/line/me'),
  });
  // Start unknown so the "notifications off" card never pops in after the switches render.
  const [permission, setPermission] = useState<Awaited<ReturnType<typeof pushPermission>>>('undetermined');
  const [failed, setFailed] = useState('');

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

  const lineOff = line.data?.connected === false;
  const denied = permission === 'denied';
  const save = (name: string, patch: { category: Parameters<typeof update.mutate>[0]['category']; push?: boolean; line?: boolean }) => {
    setFailed('');
    update.mutate(patch, { onError: () => setFailed(name) });
  };

  return <FormSection title="การแจ้งเตือน" detail="เลือกว่าเรื่องไหนให้เด้งเข้าแอปหรือส่ง LINE · ทุกเรื่องยังเก็บไว้ในหน้าการแจ้งเตือนเสมอ">
    {denied ? <Card flat style={styles.denied}>
      <Text style={{ color: colors.warn, fontWeight: '700' }}>เครื่องนี้ปิดการแจ้งเตือนของแอปอยู่</Text>
      <Text style={{ color: colors.text, marginTop: spacing.xs, fontSize: 14, lineHeight: 22 }}>เปิดในตั้งค่าเครื่องก่อน สวิตช์ “แอป” ด้านล่างจึงจะมีผล</Text>
      <Pressable accessibilityRole="button" onPress={() => Linking.openSettings()}
        style={({ pressed }) => [{ minHeight: 44, justifyContent: 'center' }, pressed && { opacity: 0.6 }]}>
        <Text style={{ color: colors.ink, fontWeight: '700' }}>เปิดตั้งค่าเครื่อง</Text>
      </Pressable>
    </Card> : null}
    {lineOff ? <Text style={styles.lineNote}>
      ยังไม่เชื่อม LINE · เชื่อมได้ที่หน้าตั้งค่าบนเว็บ แล้วสวิตช์ LINE จึงจะใช้ได้
    </Text> : null}
    {line.isError ? <InlineError message="ตรวจสถานะการเชื่อม LINE ไม่สำเร็จ" onRetry={() => line.refetch()} /> : null}
    {prefs.isLoading ? <LoadingState inline label="กำลังโหลดการตั้งค่าแจ้งเตือน…" /> : prefs.isError ? <ErrorState message="โหลดการตั้งค่าแจ้งเตือนไม่สำเร็จ" onRetry={() => prefs.refetch()} /> : <View>
      {prefs.data?.map((row, index) => {
        const label = CATEGORY_META[row.category]?.label ?? row.category;
        return <View key={row.category} style={[{ paddingVertical: spacing.md }, index > 0 && { borderTopWidth: 1, borderTopColor: colors.divider }]}>
          <Text style={{ color: colors.ink, fontWeight: '700' }}>{label}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.lg }}>
            <ChannelToggle label="แอป" a11yLabel={`${label} · แจ้งเตือนในแอป`} value={row.push} dim={denied}
              note={denied ? 'ปิดอยู่ที่เครื่อง' : undefined}
              onChange={(push) => save(`${label} · แอป`, { category: row.category, push })} />
            <ChannelToggle label="LINE" a11yLabel={`${label} · ส่ง LINE`} value={row.line} disabled={lineOff}
              note={lineOff ? 'ยังไม่เชื่อม LINE' : undefined}
              onChange={(value) => save(`${label} · LINE`, { category: row.category, line: value })} />
          </View>
        </View>;
      })}
    </View>}
    {update.isError && failed ? <InlineError message={`บันทึก “${failed}” ไม่สำเร็จ ลองใหม่อีกครั้ง`} /> : null}
  </FormSection>;
}

const styles = StyleSheet.create({
  // Segmented look: a sunken track, the chosen size lifts out of it as a raised pill.
  sizeTrack: { gap: spacing.xs, padding: spacing.xs, borderRadius: radius.lg, backgroundColor: colors.sunken },
  size: { minHeight: 48, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: 'transparent', borderRadius: radius.md },
  sizeOn: { backgroundColor: colors.raised, borderColor: colors.line, ...shadow.sm },
  preview: { marginTop: spacing.sm, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.divider, backgroundColor: colors.bg },
  denied: { backgroundColor: colors.warnSoft, borderColor: colors.warnEdge },
  lineNote: { color: colors.info, backgroundColor: colors.infoSoft, borderWidth: 1, borderColor: colors.infoEdge, borderRadius: radius.md,
    padding: spacing.md, fontSize: 14, lineHeight: 22 },
  toggle: { flexGrow: 1, flexBasis: '40%', minWidth: 120, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
