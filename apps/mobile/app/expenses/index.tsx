import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, View, Pressable, RefreshControl } from 'react-native';
import { Text } from '@/components/AppText';
import { useFocusEffect, useRouter } from 'expo-router';
import { useAuth } from '@/api/auth';
import { useExpenses, useSubmitExpenses } from '@/api/hooks';
import { draftScope, ExpenseDraft, listExpenseDrafts, removeExpenseDraft } from '@/api/drafts';
import { Button, Card, EmptyNote, ErrorNote, PageIntro, SectionLabel, Tag } from '@/components/ui';
import { formatMoney, thDate } from '@/format';
import { colors, spacing, pageContent } from '@/theme';

export default function ExpensesScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const expenses = useExpenses();
  const submit = useSubmitExpenses();
  const [local, setLocal] = useState<ExpenseDraft[]>([]);
  const [localError, setLocalError] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const scope = user ? draftScope(user) : '';
  const load = useCallback(() => {
    if (!scope) return;
    return listExpenseDrafts(scope).then((rows) => { setLocal(rows); setLocalError(''); })
      .catch(() => setLocalError('โหลดร่างในเครื่องไม่สำเร็จ'));
  }, [scope]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const drafts = (expenses.data ?? []).filter((item) => (item.userId ?? item.user?.id) === user?.id && item.status === 'DRAFT');
  const chosen = drafts.filter((item) => selected.includes(item.id));
  const send = () => Alert.alert('ส่งเบิกเป็นชุด', `${chosen.length} รายการ รวม ${formatMoney(chosen.reduce((sum, item) => sum + item.amount, 0))} บาท`, [
    { text: 'ยกเลิก', style: 'cancel' },
    { text: 'ส่งชุดนี้', onPress: () => submit.mutate(chosen.map((item) => item.id), {
      onSuccess: (claim) => { setSelected([]); router.push(`/expenses/claim/${claim.id}`); },
      onError: (error) => Alert.alert('ส่งไม่สำเร็จ', error.message),
    }) },
  ]);
  return <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={pageContent}
    refreshControl={<RefreshControl refreshing={expenses.isRefetching} onRefresh={() => { expenses.refetch(); void load(); }} />}>
    <PageIntro title="ค่าใช้จ่ายของฉัน" detail="บันทึกรายการ เลือกรวมเป็นชุด แล้วส่งเบิก" />
    <View style={{ gap: spacing.sm }}>
      <Button title="เพิ่มค่าใช้จ่าย" onPress={() => router.push('/expenses/new')} />
      <Button title={user?.firmRole === 'OWNER' ? 'ดูชุดเบิกทีม · อนุมัติ / จ่าย' : 'ดูชุดที่ส่งเบิกแล้ว'} ghost onPress={() => router.push('/expenses/claims')} />
    </View>
    <SectionLabel>ร่างในเครื่อง · รอเติมรายละเอียด</SectionLabel>
    {!!localError && <ErrorNote message={localError} onRetry={load} />}
    {!local.length && !localError && <EmptyNote>ไม่มีร่างค้าง</EmptyNote>}
    {local.map((item) => <Card key={item.id} style={{ marginBottom: spacing.md }}>
      <Pressable accessibilityRole="button" onPress={() => router.push(`/expenses/new?draftId=${item.id}`)} style={{ minHeight: 44 }}>
        <Text style={{ color: colors.ink, fontWeight: '600' }}>{item.category} · {item.amount ? `${formatMoney(item.amount)} ฿` : 'ยังไม่ใส่ยอด'}</Text>
        <Text style={{ color: colors.muted }}>{item.caseRef?.label ?? 'ค่าใช้จ่ายสำนักงาน'} · {item.receiptUri ? 'มีใบเสร็จ' : 'ไม่มีใบเสร็จ'}</Text>
        <Text style={{ color: colors.info }}>{item.savedExpenseId ? 'บันทึกแล้ว · ปิดร่าง' : 'เติมต่อ'}</Text>
      </Pressable>
      <Button title="ลบร่าง" ghost onPress={() => Alert.alert('ลบร่างนี้?', 'ข้อมูลและใบเสร็จในเครื่องจะถูกลบ', [
        { text: 'ยกเลิก', style: 'cancel' }, { text: 'ลบ', style: 'destructive', onPress: async () => {
          try { await removeExpenseDraft(scope, item); await load(); } catch { Alert.alert('ลบไม่สำเร็จ', 'ลองใหม่อีกครั้ง'); }
        } },
      ])} />
    </Card>)}
    <SectionLabel>เลือกค่าใช้จ่ายเพื่อรวมเป็นชุดเบิก</SectionLabel>
    {expenses.isError && <ErrorNote message="โหลดค่าใช้จ่ายไม่สำเร็จ" onRetry={() => expenses.refetch()} />}
    {expenses.isLoading ? <Text>กำลังโหลด…</Text> : !drafts.length && <EmptyNote>ยังไม่มีรายการพร้อมส่ง</EmptyNote>}
    {drafts.map((item) => <Pressable key={item.id} accessibilityRole="checkbox" accessibilityState={{ checked: selected.includes(item.id), disabled: submit.isPending }}
      disabled={submit.isPending} onPress={() => setSelected((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])}>
      <Card style={{ marginBottom: spacing.md, borderColor: selected.includes(item.id) ? colors.ink : colors.line }}>
        <Text style={{ color: colors.ink, fontWeight: '600' }}>{selected.includes(item.id) ? '✓ ' : '○ '}{item.category} · {formatMoney(item.amount)} ฿</Text>
        <Text style={{ color: colors.muted }}>{item.description}</Text>
        <Text style={{ color: colors.muted }}>{thDate(item.date)} · {item.case?.ownRef ?? 'สำนักงาน'}</Text>
        <Tag tone="plain">{item.receiptFilename ? 'มีใบเสร็จ' : 'ไม่มีใบเสร็จ'}</Tag>
      </Card>
    </Pressable>)}
    <Card style={{ gap: spacing.sm, marginTop: spacing.sm }}>
      <Text style={{ color: colors.ink, fontWeight: '700' }}>เลือก {chosen.length} รายการ · {formatMoney(chosen.reduce((sum, item) => sum + item.amount, 0))} ฿</Text>
      <Button title="ส่งเบิกชุดที่เลือก" onPress={send} disabled={!chosen.length || expenses.isError || expenses.isFetching} busy={submit.isPending} />
    </Card>
  </ScrollView>;
}
