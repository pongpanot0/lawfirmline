import React, { useState } from 'react';
import { Alert, Linking, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/api/auth';
import { api, ApiError } from '@/api/client';
import type { AccountDeletionRequest } from '@/api/types';
import { FormPage, FormSection } from '@/components/Form';
import { Text, TextInput } from '@/components/AppText';
import { ActionRow, Button, Card, ErrorNote, Loading, PageIntro, Tag } from '@/components/ui';
import { colors, spacing } from '@/theme';

export default function DeleteAccountScreen() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [password, setPassword] = useState('');
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
      setPassword('');
      // Show the accepted request even if a subsequent network refresh fails.
      queryClient.setQueryData(['account-deletion-request', user?.id], request);
      Alert.alert('รับคำขอแล้ว', `หมายเลข ${request.id}\nบัญชียังไม่ถูกลบ เจ้าหน้าที่จะตรวจขอบเขตข้อมูลและการส่งต่องานก่อนดำเนินการ`);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401
        ? 'รหัสผ่านไม่ถูกต้องหรือเซสชันหมดอายุ ตรวจรหัสผ่านหรือเข้าสู่ระบบใหม่'
        : err instanceof ApiError && err.status === 429 ? 'ทำรายการถี่เกินไป รอสักครู่แล้วลองใหม่'
          : 'ส่งคำขอไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่');
    } finally { setBusy(false); }
  };
  return <FormPage>
    <PageIntro title="ลบบัญชีและข้อมูล" detail={user?.email} />
    <Card style={{ gap: spacing.md }}>
      <Tag tone="plain">ดำเนินการผ่านคำขอ</Tag>
      <Text style={{ color: colors.ink, fontWeight: '600' }}>ส่งคำขอแล้ว บัญชียังไม่ถูกลบทันที</Text>
      <Text style={{ color: colors.muted }}>คำขอครอบคลุมบัญชีของคุณในทุกสำนักงาน เจ้าหน้าที่จะตรวจข้อมูลส่วนตัวและงานที่สำนักงานต้องรับช่วงก่อนลบ</Text>
      <Text style={{ color: colors.muted }}>ข้อมูลคดีของสำนักงานต้องตรวจขอบเขตการเก็บและส่งต่องานแยกจากข้อมูลบัญชีส่วนตัว</Text>
    </Card>
    {deletion.isLoading ? <Loading /> : deletion.isError ?
      <ErrorNote message="โหลดสถานะคำขอไม่สำเร็จ กรุณาลองใหม่ก่อนส่งคำขอ" onRetry={() => deletion.refetch()} /> : deletion.data ?
      <FormSection title="รับคำขอแล้ว · รอตรวจดำเนินการ">
        <Text selectable style={{ color: colors.ink }}>หมายเลข {deletion.data.id}</Text>
        <Text style={{ color: colors.muted }}>บัญชียังไม่ถูกลบ ติดตามคำขอได้ที่ hello@samnuan.co</Text>
      </FormSection> : <FormSection title="ยืนยันว่าเป็นบัญชีของคุณ" detail="กรอกรหัสผ่านปัจจุบันเพื่อส่งคำขอ">
        <TextInput accessibilityLabel="รหัสผ่านปัจจุบันเพื่อขอลบบัญชี" value={password} onChangeText={setPassword}
          editable={!busy} secureTextEntry autoCapitalize="none" autoComplete="current-password"
          style={{ minHeight: 48, padding: spacing.md, borderWidth: 1, borderRadius: 10,
            borderColor: colors.line, backgroundColor: colors.surface, color: colors.text, fontSize: 15 }} />
        {error ? <ErrorNote message={error} /> : null}
        <Button title="ส่งคำขอลบบัญชี" busy={busy} disabled={!password || deletion.isFetching}
          onPress={() => Alert.alert('ส่งคำขอลบบัญชี?', 'คุณกำลังขอลบบัญชีและข้อมูลส่วนตัวในทุกสำนักงาน เจ้าหน้าที่จะตรวจคำขอก่อนดำเนินการ', [
            { text: 'ยกเลิก', style: 'cancel' }, { text: 'ส่งคำขอ', style: 'destructive', onPress: send },
          ])} />
      </FormSection>}
    <View style={{ marginTop: spacing.sm }}>
      <ActionRow title="ขอลบบัญชีผ่านเว็บไซต์" onPress={() => Linking.openURL('https://samnuan.com/delete-account')} />
      <ActionRow title="นโยบายความเป็นส่วนตัว" onPress={() => Linking.openURL('https://samnuan.com/privacy')} />
    </View>
  </FormPage>;
}
