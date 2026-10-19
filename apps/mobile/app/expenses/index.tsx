import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View, Pressable, RefreshControl } from 'react-native';
import { Text } from '@/components/AppText';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronRight, FilePen, Square, SquareCheck } from 'lucide-react-native';
import { hasFirmCapability } from '@lawfirm/shared';
import { useAuth } from '@/api/auth';
import { useExpenses, useSubmitExpenses } from '@/api/hooks';
import { draftScope, ExpenseDraft, listExpenseDrafts, removeExpenseDraft } from '@/api/drafts';
import { Button, Card, EmptyState, ErrorState, InlineError, LoadingState, PageIntro, SectionLabel, Tag } from '@/components/ui';
import { formatMoney, thDate } from '@/format';
import { colors, fonts, radius, shadow, spacing, pageContent } from '@/theme';

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
        {!!localError && <InlineError message={localError} onRetry={load} style={{ marginBottom: spacing.sm }} />}
        {local.length > 0 && <Card style={styles.listCard}>
          {local.map((item, index) => <View key={item.id} style={[styles.draftItem, index > 0 && styles.divided]}>
            <Pressable accessibilityRole="button"
              accessibilityLabel={`${item.savedExpenseId ? 'ปิดร่าง' : 'เติมร่างต่อ'} ${item.category} ${item.amount ? `${formatMoney(item.amount)} บาท` : 'ยังไม่ใส่ยอด'}`}
              onPress={() => router.push(`/expenses/new?draftId=${item.id}`)} style={({ pressed }) => [styles.draftRow, pressed && { opacity: 0.7 }]}>
              <View style={styles.iconTile}><FilePen size={18} color={colors.info} /></View>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text style={styles.rowTitle}>{item.category}</Text>
                <Text style={styles.meta}>{item.caseRef?.label ?? 'ค่าใช้จ่ายสำนักงาน'} · {item.receiptUri ? 'มีใบเสร็จ' : 'ไม่มีใบเสร็จ'}</Text>
                <Text style={{ color: colors.info, fontSize: 14, fontWeight: '600' }}>{item.savedExpenseId ? 'บันทึกแล้ว · ปิดร่าง' : 'เติมต่อ'}</Text>
              </View>
              <Text style={[styles.amount, !item.amount && styles.amountMissing]}>{item.amount ? `${formatMoney(item.amount)} ฿` : 'ยังไม่ใส่ยอด'}</Text>
              <ChevronRight size={18} color={colors.muted} />
            </Pressable>
            <View style={{ paddingLeft: 40 + spacing.md }}><Button title="ลบร่าง" variant="danger" inline onPress={() => removeDraft(item)} /></View>
          </View>)}
        </Card>}
      </>}
      <SectionLabel>บันทึกแล้ว · รอส่งเบิก</SectionLabel>
      {expenses.isError && <ErrorState message="โหลดค่าใช้จ่ายไม่สำเร็จ" onRetry={() => expenses.refetch()} style={{ marginBottom: spacing.sm }} />}
      {expenses.isLoading ? <LoadingState inline label="กำลังโหลดค่าใช้จ่าย…" />
        : !expenses.isError && !drafts.length && <Card><EmptyState compact action={{ title: 'เพิ่มค่าใช้จ่าย', onPress: () => router.push('/expenses/new') }}>ยังไม่มีรายการพร้อมส่ง</EmptyState></Card>}
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
          disabled={submit.isPending} onPress={() => toggle(item.id)}
          style={({ pressed }) => pressed && { opacity: 0.85 }}>
          <Card style={[styles.pickCard, on && styles.pickCardOn]}>
            <View style={styles.pickRow}>
              {on ? <SquareCheck size={22} color={colors.ink} /> : <Square size={22} color={colors.muted} />}
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text style={styles.rowTitle}>{item.category}</Text>
                {item.description ? <Text style={styles.meta}>{item.description}</Text> : null}
                <Text style={styles.meta}>{thDate(item.date)} · {item.case?.ownRef ?? 'สำนักงาน'}</Text>
                <View style={{ marginTop: spacing.xs }}><Tag tone={item.receiptFilename ? 'ok' : 'plain'}>{item.receiptFilename ? 'มีใบเสร็จ' : 'ไม่มีใบเสร็จ'}</Tag></View>
              </View>
              <Text style={styles.amount}>{formatMoney(item.amount)} ฿</Text>
            </View>
          </Card>
        </Pressable>;
      })}
    </ScrollView>
    {chosen.length > 0 && <View style={[styles.footer, { paddingBottom: spacing.lg + insets.bottom }]}>
      <InlineError message={submitError || undefined} />
      <View style={styles.footerSum}>
        <Text style={{ color: colors.muted, fontWeight: '600' }}>เลือก {chosen.length} รายการ</Text>
        <Text style={styles.footerTotal}>{formatMoney(chosenTotal)} ฿</Text>
      </View>
      <Button title="ส่งเบิกชุดที่เลือก" onPress={send} disabled={expenses.isError || expenses.isFetching} busy={submit.isPending} />
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  meta: { color: colors.muted, fontSize: 14, lineHeight: 22 },
  rowTitle: { color: colors.ink, fontWeight: '700', fontSize: 15 },
  amount: { color: colors.ink, fontFamily: fonts.bold, fontSize: 17, fontVariant: ['tabular-nums'], textAlign: 'right', flexShrink: 0 },
  amountMissing: { color: colors.muted, fontFamily: fonts.semibold, fontSize: 13 },
  listCard: { paddingVertical: spacing.xs },
  draftItem: { paddingVertical: spacing.xs },
  divided: { borderTopWidth: 1, borderTopColor: colors.divider },
  draftRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44, paddingVertical: spacing.sm },
  iconTile: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.infoSoft, alignItems: 'center', justifyContent: 'center' },
  pickCard: { marginBottom: spacing.md },
  pickCardOn: { borderColor: colors.ink, backgroundColor: colors.raised, ...shadow.md },
  pickRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  selectAll: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 48, marginBottom: spacing.xs },
  footer: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.lg,
    borderTopWidth: 1, borderTopColor: colors.divider, backgroundColor: colors.raised, ...shadow.bar },
  footerSum: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.md },
  footerTotal: { color: colors.ink, fontFamily: fonts.bold, fontSize: 22, lineHeight: 30, fontVariant: ['tabular-nums'] },
});
