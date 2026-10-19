import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View, Pressable, RefreshControl } from 'react-native';
import { Text } from '@/components/AppText';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronRight, Square, SquareCheck } from 'lucide-react-native';
import { hasFirmCapability } from '@lawfirm/shared';
import { useAuth } from '@/api/auth';
import { useExpenses, useSubmitExpenses } from '@/api/hooks';
import { draftScope, ExpenseDraft, listExpenseDrafts, removeExpenseDraft } from '@/api/drafts';
import { Button, Card, EmptyNote, ErrorNote, Loading, PageIntro, SectionLabel, Tag } from '@/components/ui';
import { formatMoney, thDate } from '@/format';
import { colors, spacing, pageContent } from '@/theme';

export default function ExpensesScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const expenses = useExpenses();
  const submit = useSubmitExpenses();
  const [local, setLocal] = useState<ExpenseDraft[]>([]);
  const [localError, setLocalError] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [submitError, setSubmitError] = useState('');
  const scope = user ? draftScope(user) : '';
  const load = useCallback(() => {
    if (!scope) return;
    return listExpenseDrafts(scope).then((rows) => { setLocal(rows); setLocalError(''); })
      .catch(() => setLocalError('โหลดร่างในเครื่องไม่สำเร็จ'));
  }, [scope]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const drafts = (expenses.data ?? []).filter((item) => (item.userId ?? item.user?.id) === user?.id && item.status === 'DRAFT');
  const chosen = drafts.filter((item) => selected.includes(item.id));
  const chosenTotal = chosen.reduce((sum, item) => sum + item.amount, 0);
  const allChosen = drafts.length > 0 && chosen.length === drafts.length;
  const toggle = (id: string) => { setSubmitError(''); setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]); };
  const send = () => Alert.alert('ส่งเบิกเป็นชุด', `${chosen.length} รายการ รวม ${formatMoney(chosenTotal)} บาท`, [
    { text: 'ยกเลิก', style: 'cancel' },
    { text: 'ส่งชุดนี้', onPress: () => { setSubmitError(''); submit.mutate(chosen.map((item) => item.id), {
      onSuccess: (claim) => { setSelected([]); router.push(`/expenses/claim/${claim.id}`); },
      onError: (error) => setSubmitError(`ส่งไม่สำเร็จ · ${error.message}`),
    }); } },
  ]);
  const removeDraft = (item: ExpenseDraft) => Alert.alert('ลบร่างนี้?', 'ข้อมูลและใบเสร็จในเครื่องจะถูกลบ', [
    { text: 'ยกเลิก', style: 'cancel' }, { text: 'ลบ', style: 'destructive', onPress: async () => {
      try { await removeExpenseDraft(scope, item); await load(); } catch { setLocalError('ลบร่างไม่สำเร็จ · ลองใหม่อีกครั้ง'); }
    } },
  ]);
  return <View style={{ flex: 1, backgroundColor: colors.bg }}>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={pageContent}
      refreshControl={<RefreshControl refreshing={expenses.isRefetching} onRefresh={() => { expenses.refetch(); void load(); }} />}>
      <PageIntro title="ค่าใช้จ่าย" detailOnly detail="บันทึกรายการ เลือกรวมเป็นชุด แล้วส่งเบิก" />
      {/* While a batch is selected, sending it is the primary action; adding steps back. */}
      <Button title="เพิ่มค่าใช้จ่าย" variant={chosen.length ? 'secondary' : 'primary'} onPress={() => router.push('/expenses/new')} />
      <Button title={hasFirmCapability(user?.firmRole, 'approveExpenses') ? 'ดูชุดเบิกทีม · อนุมัติ / จ่าย' : 'ดูชุดที่ส่งเบิกแล้ว'} variant="link" onPress={() => router.push('/expenses/claims')} />
      {(local.length > 0 || !!localError) && <>
        <SectionLabel>ยังกรอกไม่ครบ · อยู่ในเครื่องนี้</SectionLabel>
        {!!localError && <ErrorNote message={localError} onRetry={load} />}
        {local.map((item) => <Card key={item.id} style={{ marginBottom: spacing.sm, paddingVertical: spacing.xs }}>
          <Pressable accessibilityRole="button"
            accessibilityLabel={`${item.savedExpenseId ? 'ปิดร่าง' : 'เติมร่างต่อ'} ${item.category} ${item.amount ? `${formatMoney(item.amount)} บาท` : 'ยังไม่ใส่ยอด'}`}
            onPress={() => router.push(`/expenses/new?draftId=${item.id}`)} style={({ pressed }) => [styles.draftRow, pressed && { opacity: 0.7 }]}>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text style={{ color: colors.ink, fontWeight: '600' }}>{item.category} · {item.amount ? `${formatMoney(item.amount)} ฿` : 'ยังไม่ใส่ยอด'}</Text>
              <Text style={styles.meta}>{item.caseRef?.label ?? 'ค่าใช้จ่ายสำนักงาน'} · {item.receiptUri ? 'มีใบเสร็จ' : 'ไม่มีใบเสร็จ'}</Text>
              <Text style={{ color: colors.info, fontSize: 14 }}>{item.savedExpenseId ? 'บันทึกแล้ว · ปิดร่าง' : 'เติมต่อ'}</Text>
            </View>
            <ChevronRight size={18} color={colors.muted} />
          </Pressable>
          <Button title="ลบร่าง" variant="danger" inline onPress={() => removeDraft(item)} />
        </Card>)}
      </>}
      <SectionLabel>บันทึกแล้ว · รอส่งเบิก</SectionLabel>
      {expenses.isError && <ErrorNote message="โหลดค่าใช้จ่ายไม่สำเร็จ" onRetry={() => expenses.refetch()} />}
      {expenses.isLoading ? <Loading label="กำลังโหลดค่าใช้จ่าย…" />
        : !expenses.isError && !drafts.length && <EmptyNote action={{ title: 'เพิ่มค่าใช้จ่าย', onPress: () => router.push('/expenses/new') }}>ยังไม่มีรายการพร้อมส่ง</EmptyNote>}
      {drafts.length > 1 && <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: allChosen, disabled: submit.isPending }} disabled={submit.isPending}
        accessibilityLabel={`เลือกทั้งหมด ${drafts.length} รายการ`}
        onPress={() => { setSubmitError(''); setSelected(allChosen ? [] : drafts.map((item) => item.id)); }}
        style={({ pressed }) => [styles.selectAll, pressed && { opacity: 0.7 }]}>
        {allChosen ? <SquareCheck size={22} color={colors.ink} /> : <Square size={22} color={colors.muted} />}
        <Text style={{ color: colors.ink, fontWeight: '600' }}>เลือกทั้งหมด ({drafts.length})</Text>
      </Pressable>}
      {drafts.map((item) => {
        const on = selected.includes(item.id);
        return <Pressable key={item.id} accessibilityRole="checkbox" accessibilityState={{ checked: on, disabled: submit.isPending }}
          accessibilityLabel={`${item.category} ${formatMoney(item.amount)} บาท ${thDate(item.date)}`}
          disabled={submit.isPending} onPress={() => toggle(item.id)}>
          <Card style={{ marginBottom: spacing.sm, borderColor: on ? colors.ink : colors.line }}>
            <View style={styles.pickRow}>
              {on ? <SquareCheck size={22} color={colors.ink} /> : <Square size={22} color={colors.muted} />}
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text style={{ color: colors.ink, fontWeight: '600' }}>{item.category} · {formatMoney(item.amount)} ฿</Text>
                {item.description ? <Text style={styles.meta}>{item.description}</Text> : null}
                <Text style={styles.meta}>{thDate(item.date)} · {item.case?.ownRef ?? 'สำนักงาน'}</Text>
                <Tag tone="plain">{item.receiptFilename ? 'มีใบเสร็จ' : 'ไม่มีใบเสร็จ'}</Tag>
              </View>
            </View>
          </Card>
        </Pressable>;
      })}
    </ScrollView>
    {chosen.length > 0 && <View style={[styles.footer, { paddingBottom: spacing.lg + insets.bottom }]}>
      {!!submitError && <ErrorNote message={submitError} />}
      <Text style={{ color: colors.ink, fontWeight: '700' }}>เลือก {chosen.length} รายการ · {formatMoney(chosenTotal)} ฿</Text>
      <Button title="ส่งเบิกชุดที่เลือก" onPress={send} disabled={expenses.isError || expenses.isFetching} busy={submit.isPending} />
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  meta: { color: colors.muted, fontSize: 14, lineHeight: 22 },
  draftRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44, paddingVertical: spacing.sm },
  pickRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  selectAll: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 48, marginBottom: spacing.xs },
  footer: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.lg,
    borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.surface },
});
