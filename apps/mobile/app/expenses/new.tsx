import React, { useEffect, useState } from 'react';
import { Alert, Image, InputAccessoryView, Keyboard, Platform, Pressable, ScrollView, View } from 'react-native';
import { Text, TextInput } from '@/components/AppText';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQueryClient } from '@tanstack/react-query';
import { EXPENSE_CATEGORIES } from '@lawfirm/shared';
import { useAuth } from '@/api/auth';
import { createExpense } from '@/api/files';
import { draftScope, ExpenseDraft, removeExpenseDraft, retainReceipt, saveDraft } from '@/api/drafts';
import { CasePicker } from '@/components/CasePicker';
import { DatePicker } from '@/components/DatePicker';
import { Dropdown } from '@/components/Dropdown';
import { FormSection } from '@/components/Form';
import { Button, Loading, PageIntro, SectionLabel } from '@/components/ui';
import { expenseError } from '@/workflow';
import { bangkokDay, formatMoneyInput } from '@/format';
import { colors, spacing, formLabelSpacing, pageContent } from '@/theme';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';

export default function NewExpenseScreen() {
  const { draftId, caseId, caseLabel, eventId } = useLocalSearchParams<{ draftId?: string; caseId?: string; caseLabel?: string; eventId?: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const client = useQueryClient();
  const keyboardHeight = useKeyboardHeight();
  const scope = user ? draftScope(user) : '';
  const [draft, setDraft] = useState<ExpenseDraft>({
    id: draftId ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`, category: '', amount: '', description: '',
    date: bangkokDay(new Date().toISOString()), sourceEventId: eventId, receiptUri: null,
    caseRef: caseId ? { id: caseId, label: caseLabel ?? 'คดีที่เลือกไว้' } : null,
  });
  const [ready, setReady] = useState(!draftId);
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const [localStatus, setLocalStatus] = useState('');
  useEffect(() => {
    if (!draftId || !scope) return;
    let active = true;
    AsyncStorage.getItem(`${scope}expense:${draftId}`).then((value) => {
      if (!value) throw new Error('ไม่พบร่างนี้');
      if (active) { const stored = JSON.parse(value); setDraft(stored); setUploaded(!!stored.savedExpenseId); setReady(true); }
    }).catch((error) => { if (active) Alert.alert('เปิดร่างไม่ได้', error.message, [{ text: 'กลับ', onPress: () => router.back() }]); });
    return () => { active = false; };
  }, [draftId, scope]);
  useEffect(() => {
    if (!ready || !scope || uploaded || busy || (!draft.category && !draft.amount && !draft.description && !draft.receiptUri)) return;
    let active = true;
    setLocalStatus('กำลังเก็บร่างในเครื่อง…');
    saveDraft(`${scope}expense:${draft.id}`, draft)
      .then(() => { if (active) setLocalStatus('เก็บร่างในเครื่องแล้ว'); })
      .catch(() => { if (active) setLocalStatus('เก็บร่างไม่สำเร็จ กรุณากดเก็บร่างอีกครั้งก่อนออก'); });
    return () => { active = false; };
  }, [draft, ready, scope, uploaded, busy]);
  const change = (value: Partial<ExpenseDraft>) => setDraft((current) => ({ ...current, ...value }));
  const photo = async (camera: boolean) => {
    setBusy(true);
    try {
      const permission = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) { Alert.alert('ยังไม่ได้รับสิทธิ์', 'เปิดสิทธิ์กล้องหรือรูปภาพในการตั้งค่าของอุปกรณ์'); return; }
      const options = { quality: 0.6, mediaTypes: ['images'] as ImagePicker.MediaType[], preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible };
      const result = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const mime = asset.mimeType ?? 'image/jpeg';
        if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(mime)) throw new Error('เลือกรูป JPEG หรือ PNG สำหรับใบเสร็จนี้');
        if (asset.fileSize && asset.fileSize > 10 * 1024 * 1024) throw new Error('รูปใบเสร็จใหญ่เกิน 10 MB กรุณาเลือกรูปที่เล็กลง');
        const next = { ...draft, receiptUri: await retainReceipt(scope, draft.id, asset.uri), receiptMimeType: mime };
        await saveDraft(`${scope}expense:${draft.id}`, next);
        setDraft(next);
      }
    } catch (error) { Alert.alert('เก็บใบเสร็จไม่ได้', error instanceof Error ? error.message : 'ลองใหม่อีกครั้ง'); }
    finally { setBusy(false); }
  };
  const save = async (complete: boolean) => {
    const error = expenseError(draft.category, draft.description, draft.amount, complete);
    if (error) return Alert.alert('ตรวจสอบข้อมูล', error);
    setBusy(true);
    let retained = false;
    let savedInSystem = uploaded;
    try {
      await saveDraft(`${scope}expense:${draft.id}`, draft);
      retained = true;
      if (complete && !uploaded) {
        const expense = await createExpense({ amount: Number(draft.amount.replace(/,/g, '')), category: draft.category,
          description: draft.description.trim() || draft.category, date: draft.date, sourceEventId: draft.sourceEventId,
          caseId: draft.caseRef?.id, receiptUri: draft.receiptUri ?? undefined, receiptMimeType: draft.receiptMimeType });
        setUploaded(true);
        savedInSystem = true;
        const saved = { ...draft, savedExpenseId: expense.id };
        setDraft(saved);
        await saveDraft(`${scope}expense:${draft.id}`, saved);
        client.invalidateQueries({ queryKey: ['expenses'] });
      }
      if (complete) await removeExpenseDraft(scope, draft);
      router.back();
    } catch (error) { Alert.alert(savedInSystem ? 'บันทึกแล้ว แต่ปิดร่างไม่สำเร็จ' : 'ยังบันทึกเข้าระบบไม่ได้', `${error instanceof Error ? error.message : 'กรุณาลองใหม่'}\n${savedInSystem ? 'รายการอยู่ในระบบแล้ว กดปิดร่างนี้ได้โดยไม่ส่งซ้ำ' : retained ? 'ร่างและใบเสร็จยังอยู่ในเครื่อง ถ้าเน็ตหลุดระหว่างส่ง ให้ตรวจรายการค่าใช้จ่ายก่อนส่งอีกครั้ง' : 'เก็บร่างในเครื่องไม่ได้ กรุณาอยู่หน้านี้และลองเก็บร่างอีกครั้ง'}`); }
    finally { setBusy(false); }
  };
  if (!ready || !user) return <Loading />;
  const field = { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: spacing.md, minHeight: 48, color: colors.text };
  if (uploaded) return <View style={{ padding: spacing.lg, gap: spacing.md }}><Text>บันทึกค่าใช้จ่ายในระบบแล้ว</Text><Button title="ปิดร่างนี้" onPress={() => save(true)} busy={busy} /></View>;
  return <>
    <Stack.Screen options={{ title: 'เพิ่มค่าใช้จ่าย' }} />
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView automaticallyAdjustKeyboardInsets keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" contentContainerStyle={{ ...pageContent, gap: spacing.sm, paddingBottom: spacing.xl + keyboardHeight }}>
        <PageIntro title="บันทึกค่าใช้จ่าย" detail="เก็บร่างพร้อมใบเสร็จก่อน แล้วเติมต่อที่สำนักงานได้" />
        <FormSection title="รายการและหลักฐาน">
        <SectionLabel style={formLabelSpacing}>เบิกค่าอะไร *</SectionLabel>
        <Dropdown label="เลือกประเภทค่าใช้จ่าย" value={draft.category} options={EXPENSE_CATEGORIES.map((value) => ({ value, label: value }))}
          onChange={(category) => change({ category })} disabled={busy} />
        <SectionLabel style={formLabelSpacing}>ใบเสร็จ</SectionLabel>
        {draft.receiptUri && <Image source={{ uri: draft.receiptUri }} style={{ width: '100%', height: 200, borderRadius: 10 }} resizeMode="contain" />}
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <View style={{ flex: 1 }}><Button title={draft.receiptUri ? 'ถ่ายใหม่' : 'ถ่ายใบเสร็จ'} ghost onPress={() => photo(true)} disabled={busy} /></View>
          <View style={{ flex: 1 }}><Button title="เลือกรูป" ghost onPress={() => photo(false)} disabled={busy} /></View>
        </View>
        </FormSection>
        <FormSection title="จำนวนเงินและแฟ้มคดี">
        <SectionLabel style={formLabelSpacing}>จำนวนเงิน · เติมทีหลังได้</SectionLabel>
        <TextInput inputAccessoryViewID="expense-keyboard" accessibilityLabel="จำนวนเงิน" style={[field, { fontSize: 24 }]} keyboardType="decimal-pad" placeholder="บาท"
          value={formatMoneyInput(draft.amount) ?? draft.amount} onChangeText={(amount) => {
            const formatted = formatMoneyInput(amount);
            if (formatted !== null) change({ amount: formatted });
          }} editable={!busy} />
        <SectionLabel style={formLabelSpacing}>{draft.category === 'อื่นๆ' ? 'รายละเอียด *' : 'รายละเอียด · ถ้ามี'}</SectionLabel>
        <TextInput inputAccessoryViewID="expense-keyboard" returnKeyType="done" onSubmitEditing={Keyboard.dismiss} accessibilityLabel="รายละเอียดค่าใช้จ่าย" style={field} placeholder="เช่น ทางด่วนไปศาล" maxLength={500}
          value={draft.description} onChangeText={(description) => change({ description })} editable={!busy} />
        <SectionLabel style={formLabelSpacing}>คดี</SectionLabel><CasePicker value={draft.caseRef} onChange={(caseRef) => change({ caseRef })} allowNone />
        <Pressable accessibilityRole="button" onPress={() => setMore(!more)} style={{ paddingVertical: spacing.md, minHeight: 44 }}>
          <Text style={{ color: colors.info }}>{more ? 'ซ่อนรายละเอียดเพิ่มเติม' : 'เปลี่ยนวันที่ค่าใช้จ่าย'}</Text>
        </Pressable>
        {more && <>
          <DatePicker value={draft.date} onChange={(date) => change({ date })} />

        </>}
        </FormSection>
        <Button title="เก็บร่างในเครื่อง · เติมที่สำนักงาน" ghost onPress={() => save(false)} disabled={busy} />
        {!!localStatus && <Text style={{ color: localStatus.includes('ไม่สำเร็จ') ? colors.warn : colors.muted }}>{localStatus}</Text>}
        <Button title="บันทึกค่าใช้จ่าย · ยังไม่ส่งเบิก" onPress={() => save(true)} busy={busy} />
      </ScrollView>
    </View>
    {Platform.OS === 'ios' && <InputAccessoryView nativeID="expense-keyboard"><View style={{ paddingHorizontal: spacing.md, backgroundColor: colors.surface, alignItems: 'flex-end' }}><Pressable accessibilityRole="button" onPress={Keyboard.dismiss} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md }}><Text style={{ color: colors.info, fontWeight: '700' }}>เสร็จ</Text></Pressable></View></InputAccessoryView>}
  </>;
}
