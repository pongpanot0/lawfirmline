import React, { useState } from 'react';
import { Alert, Linking, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/api/auth';
import { api, ApiError } from '@/api/client';
import type { AccountDeletionRequest } from '@/api/types';
import { FormPage, FormSection } from '@/components/Form';
import { TextField } from '@/components/Input';
import { Text } from '@/components/AppText';
import { ActionRow, Button, Card, ErrorState, InlineError, LoadingState, PageIntro } from '@/components/ui';
import { colors, spacing } from '@/theme';

export default function DeleteAccountScreen() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [password, setPassword] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const deletion = useQuery({ queryKey: ['account-deletion-request', user?.id],
    queryFn: () => api<AccountDeletionRequest | null>('/auth/account/deletion-request'), enabled: !!user });
  const send = async () => {
    if (busy || !password || deletion.isFetching || deletion.isError || deletion.data) return;
    setBusy(true); setError('');
    try {
      const request = await api<AccountDeletionRequest>('/auth/account/deletion-request', {
        method: 'POST', body: { currentPassword: password },
      });
      setPassword(''); setTried(false);
      // Show the accepted request even if a subsequent network refresh fails; the section below confirms it.
      queryClient.setQueryData(['account-deletion-request', user?.id], request);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401
        ? 'รหัสผ่านไม่ถูกต้องหรือเซสชันหมดอายุ ตรวจรหัสผ่านหรือเข้าสู่ระบบใหม่'
        : err instanceof ApiError && err.status === 429 ? 'ทำรายการถี่เกินไป รอสักครู่แล้วลองใหม่'
          : 'ส่งคำขอไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่');
    } finally { setBusy(false); }
  };
  const confirm = () => {
    setTried(true);
    if (!password) return;
    Alert.alert('ส่งคำขอลบบัญชี?', 'คุณกำลังขอลบบัญชีและข้อมูลส่วนตัวในทุกสำนักงาน เจ้าหน้าที่จะตรวจคำขอก่อนดำเนินการ บัญชียังไม่ถูกลบทันที', [
      { text: 'ยกเลิก', style: 'cancel' }, { text: 'ส่งคำขอ', style: 'destructive', onPress: send },
    ]);
  };
  return <FormPage>
    <PageIntro title="ลบบัญชีและข้อมูล" detailOnly detail={user?.email} />
    <Card style={{ gap: spacing.sm, backgroundColor: colors.warnSoft, borderColor: colors.warnEdge }}>
      <Text style={{ color: colors.ink, fontWeight: '700', fontSize: 16 }}>การส่งคำขอยังไม่ลบบัญชีทันที</Text>
      <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 22 }}>คำขอครอบคลุมบัญชีของคุณในทุกสำนักงาน เจ้าหน้าที่ตรวจและลบให้เสร็จภายใน 30 วันนับจากวันที่ส่งคำขอ ข้อมูลคดีของสำนักงานพิจารณาแยกจากข้อมูลบัญชีส่วนตัว</Text>
    </Card>
    {deletion.isLoading ? <LoadingState label="กำลังตรวจสถานะคำขอ…" /> : deletion.isError ?
      <ErrorState message="โหลดสถานะคำขอไม่สำเร็จ กรุณาลองใหม่ก่อนส่งคำขอ" onRetry={() => deletion.refetch()} /> : deletion.data ?
      <View accessibilityLiveRegion="polite">
        <FormSection title="รับคำขอแล้ว · รอตรวจดำเนินการ">
          <Text selectable style={{ color: colors.ink }}>หมายเลข {deletion.data.id}</Text>
          <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 22 }}>บัญชียังไม่ถูกลบ จะดำเนินการให้เสร็จภายใน 30 วันนับจากวันที่ส่งคำขอ ติดตามได้ที่ hello@samnuan.com</Text>
        </FormSection>
      </View> : <FormSection title="ยืนยันว่าเป็นบัญชีของคุณ" detail="กรอกรหัสผ่านปัจจุบันเพื่อส่งคำขอ">
        <TextField label="รหัสผ่านปัจจุบัน" required value={password} onChange={setPassword} disabled={busy}
          error={tried && !password ? 'กรอกรหัสผ่านปัจจุบันก่อนส่งคำขอ' : undefined}
          secureTextEntry autoCapitalize="none" autoComplete="current-password" textContentType="password"
          returnKeyType="send" onSubmitEditing={confirm} />
        <InlineError message={error} />
        <Button title="ส่งคำขอลบบัญชี" variant="danger" busy={busy} disabled={deletion.isFetching} onPress={confirm} />
      </FormSection>}
    <Card style={{ marginTop: spacing.sm, paddingVertical: 0 }}>
      {/* The web route is the fallback when the in-app request cannot be sent. */}
      {(deletion.isError || !!error) && <View style={{ borderBottomWidth: 1, borderBottomColor: colors.divider }}>
        <ActionRow title="ขอลบบัญชีผ่านเว็บไซต์" onPress={() => Linking.openURL('https://samnuan.com/delete-account')} />
      </View>}
      <ActionRow title="นโยบายความเป็นส่วนตัว" onPress={() => Linking.openURL('https://samnuan.com/privacy')} />
    </Card>
  </FormPage>;
}
