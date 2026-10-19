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
import { FieldError, FieldLabel, fieldA11yLabel, FormPage, FormSection, MissingSummary } from '@/components/Form';
import { Button, Loading } from '@/components/ui';
import { expenseError } from '@/workflow';
import { bangkokDay, formatMoneyInput } from '@/format';
import { colors, radius, spacing, pageContent } from '@/theme';
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
  const [uploaded, setUploaded] = useState(false);
  const [localStatus, setLocalStatus] = useState('');
  const [triedSave, setTriedSave] = useState(false);
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
    // Saving is silent; only the result is shown, so the status line does not flicker while typing.
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
  const isEmpty = !draft.category && !draft.amount && !draft.description && !draft.receiptUri;
  // Inline errors reuse the same rules as the save check, one message per field.
  const categoryError = !(EXPENSE_CATEGORIES as readonly string[]).includes(draft.category) ? 'เลือกก่อนว่าเบิกค่าอะไร' : undefined;
  const descriptionError = draft.category === 'อื่นๆ' && !draft.description.trim() ? 'ระบุว่าเบิกค่าอะไรในช่องรายละเอียด' : undefined;
  const amountError = expenseError(EXPENSE_CATEGORIES[0], '', draft.amount, true) ? 'ใส่จำนวนเงินมากกว่า 0 ไม่เกินวงเงินระบบ (ทศนิยมไม่เกิน 2 หลัก)' : undefined;
  const missing = [...(categoryError ? ['เบิกค่าอะไร'] : []), ...(descriptionError ? ['รายละเอียด'] : []), ...(amountError ? ['จำนวนเงิน'] : [])];
  /** Autosave already keeps a started draft on the device, so leaving only needs a final write (or nothing, when empty). */
  const leaveAsDraft = async () => {
    if (isEmpty) { router.back(); return; }
    setBusy(true);
    try { await saveDraft(`${scope}expense:${draft.id}`, draft); router.back(); }
    catch { setLocalStatus('เก็บร่างไม่สำเร็จ กรุณาลองอีกครั้งก่อนออก'); }
    finally { setBusy(false); }
  };
  const save = async (complete: boolean) => {
    const error = expenseError(draft.category, draft.description, draft.amount, complete);
    if (error) { setTriedSave(true); return; }
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
  const field = { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.button, padding: spacing.md, minHeight: 48, color: colors.text };
  if (uploaded) return <FormPage>
    <Stack.Screen options={{ title: 'เพิ่มค่าใช้จ่าย' }} />
    <FormSection title="บันทึกค่าใช้จ่ายนี้เข้าระบบแล้ว" detail="รายการอยู่ในค่าใช้จ่ายของฉันแล้ว ปิดร่างในเครื่องได้โดยไม่ส่งซ้ำ">
      <Button title="ปิดร่างนี้" onPress={() => save(true)} busy={busy} />
    </FormSection>
  </FormPage>;
  const otherCategory = draft.category === 'อื่นๆ';
  const descriptionField = <>
    <FieldLabel required={otherCategory}>{otherCategory ? 'รายละเอียด' : 'รายละเอียด · ถ้ามี'}</FieldLabel>
    <TextInput inputAccessoryViewID="expense-keyboard" returnKeyType="done" onSubmitEditing={Keyboard.dismiss} accessibilityLabel={fieldA11yLabel('รายละเอียดค่าใช้จ่าย', otherCategory)}
      style={[field, triedSave && descriptionError ? { borderColor: colors.warn } : null]} placeholder="เช่น ทางด่วนไปศาล" placeholderTextColor={colors.faint} maxLength={500}
      value={draft.description} onChangeText={(description) => change({ description })} editable={!busy} />
    <FieldError message={triedSave ? descriptionError : undefined} />
  </>;
  return <>
    <Stack.Screen options={{ title: 'เพิ่มค่าใช้จ่าย' }} />
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView automaticallyAdjustKeyboardInsets keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" contentContainerStyle={{ ...pageContent, gap: spacing.sm, paddingBottom: spacing.xl + keyboardHeight }}>
        <FormSection title="รายการ">
        <Dropdown label="เลือกประเภทค่าใช้จ่าย" fieldLabel="เบิกค่าอะไร" required value={draft.category} options={EXPENSE_CATEGORIES.map((value) => ({ value, label: value }))}
          error={triedSave ? categoryError : undefined} onChange={(category) => change({ category })} disabled={busy} />
        {/* "อื่นๆ" makes the description required, so it moves up next to the category. */}
        {otherCategory && descriptionField}
        <FieldLabel required>จำนวนเงิน (บาท)</FieldLabel>
        <TextInput inputAccessoryViewID="expense-keyboard" accessibilityLabel={fieldA11yLabel('จำนวนเงิน (บาท)', true)} accessibilityHint={triedSave ? amountError : undefined}
          style={[field, { fontSize: 24 }, triedSave && amountError ? { borderColor: colors.warn } : null]} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.faint}
          value={formatMoneyInput(draft.amount) ?? draft.amount} onChangeText={(amount) => {
            const formatted = formatMoneyInput(amount);
            if (formatted !== null) change({ amount: formatted });
          }} editable={!busy} />
        <FieldError message={triedSave ? amountError : undefined} />
        <DatePicker label="วันที่จ่าย" value={draft.date} onChange={(date) => change({ date })} disabled={busy} />
        </FormSection>
        <FormSection title="หลักฐานและแฟ้มคดี · ถ้ามี">
        <FieldLabel>ใบเสร็จ</FieldLabel>
        {draft.receiptUri && <>
          <Image accessibilityLabel="รูปใบเสร็จที่แนบ" source={{ uri: draft.receiptUri }} style={{ width: '100%', height: 200, borderRadius: radius.card, backgroundColor: colors.soft }} resizeMode="contain" />
          <Button title="เอาใบเสร็จออก" variant="link" disabled={busy} onPress={() => change({ receiptUri: null, receiptMimeType: undefined })} />
        </>}
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <View style={{ flex: 1 }}><Button title={draft.receiptUri ? 'ถ่ายใหม่' : 'ถ่ายใบเสร็จ'} variant="secondary" onPress={() => photo(true)} disabled={busy} /></View>
          <View style={{ flex: 1 }}><Button title="เลือกรูป" variant="secondary" onPress={() => photo(false)} disabled={busy} /></View>
        </View>
        <CasePicker label="คดี · ถ้ามี" value={draft.caseRef} onChange={(caseRef) => change({ caseRef })} allowNone disabled={busy} />
        {!otherCategory && descriptionField}
        </FormSection>
        {triedSave && <MissingSummary items={missing} />}
        <Button title="บันทึกค่าใช้จ่าย" onPress={() => save(true)} busy={busy} />
        <Text style={{ color: colors.muted, fontSize: 13, textAlign: 'center' }}>บันทึกแล้วยังไม่ส่งเบิก · รวมเป็นชุดส่งเบิกได้ที่หน้าค่าใช้จ่ายของฉัน</Text>
        {/* Draft is a quiet secondary path: autosave already keeps it on the device. */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.sm }}>
          <Text style={{ color: localStatus.includes('ไม่สำเร็จ') ? colors.warn : colors.muted, fontSize: 12 }}>{localStatus || 'ร่างเก็บในเครื่องอัตโนมัติ · กลับมาเติมทีหลังได้'}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="เก็บเป็นร่างแล้วออก" onPress={leaveAsDraft} disabled={busy}
            style={({ pressed }) => [{ minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.sm }, (pressed || busy) && { opacity: 0.6 }]}>
            <Text style={{ color: colors.info, fontWeight: '600' }}>เก็บเป็นร่างแล้วออก</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
    {Platform.OS === 'ios' && <InputAccessoryView nativeID="expense-keyboard"><View style={{ paddingHorizontal: spacing.md, backgroundColor: colors.surface, alignItems: 'flex-end' }}><Pressable accessibilityRole="button" onPress={Keyboard.dismiss} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md }}><Text style={{ color: colors.info, fontWeight: '700' }}>เสร็จ</Text></Pressable></View></InputAccessoryView>}
  </>;
}
