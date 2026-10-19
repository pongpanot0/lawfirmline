import React, { useCallback, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { hasFirmCapability } from '@lawfirm/shared';
import { useAuth } from '@/api/auth';
import { api } from '@/api/client';
import { useOwnerFinance } from '@/api/hooks';
import { PAYMENT_METHOD_LABEL, type OwnerFinance, type UnbilledCase } from '@/api/types';
import { Text } from '@/components/AppText';
import { Button, EmptyNote, ErrorNote, FilterTabs, Loading, SectionLabel, Tag } from '@/components/ui';
import type { FinanceView } from '@/components/OwnerFinanceSummary';
import { bangkokDay, formatMoney, thDate } from '@/format';
import { colors, fonts, pageContent, radius, spacing, TOUCH } from '@/theme';

const VIEWS: Array<{ value: FinanceView; label: string; total: keyof OwnerFinance['totals'] }> = [
  { value: 'receivables', label: 'ลูกหนี้', total: 'receivable' }, { value: 'received', label: 'เงินรับแล้ว', total: 'received' },
  { value: 'billed', label: 'วางบิลแล้ว', total: 'billed' }, { value: 'unbilled', label: 'ยังไม่วางบิล', total: 'unbilled' },
  { value: 'payable', label: 'รอจ่าย', total: 'payable' },
];
/** Only these two views are scoped to the chosen month; the others are everything still open. */
const MONTH_VIEWS: FinanceView[] = ['received', 'billed'];

/** "2026-10" → "ต.ค. 2569" */
function thMonth(ym: string) {
  return thDate(`${ym}-15T00:00:00Z`).split(' ').slice(1).join(' ');
}
function shiftMonth(ym: string, delta: number) {
  const index = Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1 + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

/** The whole card opens its record; the chevron says so. */
function RowCard({ label, onPress, children }: { label: string; onPress: () => void; children: React.ReactNode }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
    style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.soft }]}>
    <View style={styles.rowBody}>{children}</View>
    <ChevronRight size={18} color={colors.muted} />
  </Pressable>;
}

export default function OwnerFinanceScreen() {
  const params = useLocalSearchParams<{ view?: string }>();
  const { user } = useAuth(), owner = hasFirmCapability(user?.firmRole, 'manageInvoices');
  const router = useRouter(), client = useQueryClient();
  const today = bangkokDay(new Date().toISOString()), thisMonth = today.slice(0, 7);
  const [view, setView] = useState<FinanceView>(VIEWS.some(item => item.value === params.view) ? params.view as FinanceView : 'receivables');
  const [month, setMonth] = useState(thisMonth);
  const [allDebtors, setAllDebtors] = useState(false), [expanded, setExpanded] = useState('');
  const finance = useOwnerFinance(owner, month);
  useFocusEffect(useCallback(() => { if (owner) void finance.refetch(); }, [owner, finance.refetch]));
  const draft = useMutation({ retry: false,
    mutationFn: (group: UnbilledCase) => api<Array<{ id: string }>>(`/cases/${group.case.id}/billing/invoices`, {
      method: 'POST', body: { timeEntryIds: group.timeEntryIds, expenseIds: group.expenseIds },
    }),
    onSuccess: invoices => {
      void client.invalidateQueries({ queryKey: ['owner-finance'] }); void client.invalidateQueries({ queryKey: ['owner-kpis'] });
      if (invoices.length === 1) router.push(`/invoice/${invoices[0].id}`);
      // New drafts are listed under ยังไม่วางบิล, not with the issued invoices.
      else { setView('unbilled'); Alert.alert('สร้างร่างแล้ว', `แบ่งตามผู้จ่าย ${invoices.length} ใบ เปิดตรวจแต่ละใบก่อนบันทึกวางบิล`); }
    },
    onError: error => { void finance.refetch(); Alert.alert('สร้างร่างไม่สำเร็จ', `${error.message}\nตรวจรายการร่างล่าสุดก่อนทำอีกครั้ง`); },
  });
  if (!owner) return <EmptyNote>ข้อมูลการเงินสำนักงานสำหรับเจ้าของและผู้จัดการสำนักงาน</EmptyNote>;
  const data = finance.data;
  const dueRows = data?.receivables.filter(row => row.daysOverdue > 0 || !row.dueAt || !row.collectionOwner || (!!row.collectionNextAt && row.collectionNextAt <= today)) ?? [];
  const rows = (allDebtors ? data?.receivables ?? [] : dueRows).slice()
    .sort((a, b) => b.daysOverdue - a.daysOverdue || (a.collectionNextAt ?? '9999').localeCompare(b.collectionNextAt ?? '9999'));
  // Tabs carry the amounts, so there is no second row of tiles switching the same views.
  const tabs = VIEWS.map(item => {
    const amount = data ? Number(data.totals[item.total]) : 0;
    return { value: item.value, label: amount > 0 ? `${item.label} ${formatMoney(amount)} ฿` : item.label };
  });
  const monthScoped = MONTH_VIEWS.includes(view);
  return <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ ...pageContent, gap: spacing.sm }}
    refreshControl={<RefreshControl refreshing={finance.isRefetching} onRefresh={() => finance.refetch()} />}>
    <Stack.Screen options={{ title: 'เงินสำนักงาน / ลูกหนี้' }} />
    <FilterTabs items={tabs} value={view} onChange={value => setView(value as FinanceView)} />
    {monthScoped && <View style={styles.stepper}>
      <Pressable accessibilityRole="button" accessibilityLabel={`เดือนก่อน · ${thMonth(shiftMonth(month, -1))}`} onPress={() => setMonth(shiftMonth(month, -1))}
        style={({ pressed }) => [styles.stepperButton, pressed && { backgroundColor: colors.soft }]}>
        <ChevronLeft size={22} color={colors.ink} />
      </Pressable>
      <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={styles.stepperLabel}>{thMonth(month)}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`เดือนถัดไป · ${thMonth(shiftMonth(month, 1))}`} disabled={month >= thisMonth}
        accessibilityState={{ disabled: month >= thisMonth }} onPress={() => setMonth(shiftMonth(month, 1))}
        style={({ pressed }) => [styles.stepperButton, month >= thisMonth && { opacity: 0.35 }, pressed && { backgroundColor: colors.soft }]}>
        <ChevronRight size={22} color={colors.ink} />
      </Pressable>
    </View>}
    {monthScoped && month !== thisMonth && <Button title="กลับเดือนนี้" variant="link" onPress={() => setMonth(thisMonth)} />}
    {finance.isError && <ErrorNote message="โหลดข้อมูลการเงินล่าสุดไม่ได้ กรุณาลองใหม่ก่อนทำรายการ" onRetry={() => finance.refetch()} />}
    {finance.isLoading && <Loading label="กำลังโหลดข้อมูลการเงิน…" />}
    {view === 'receivables' && data && <>
      <SectionLabel>ยอดค้างทั้งหมด {formatMoney(data.totals.receivable)} ฿</SectionLabel>
      <FilterTabs items={[{ value: 'due', label: `ต้องตาม (${dueRows.length})` }, { value: 'all', label: `ทั้งหมด (${data.receivables.length})` }]}
        value={allDebtors ? 'all' : 'due'} onChange={value => setAllDebtors(value === 'all')} />
      {!allDebtors && <Text style={styles.note}>เกินกำหนด นัดติดตามถึงวันนี้ ยังไม่มีผู้ติดตาม หรือยังไม่ระบุวันครบกำหนด</Text>}
      {!rows.length && <EmptyNote action={!allDebtors && data.receivables.length ? { title: 'ดูลูกหนี้ทั้งหมด', onPress: () => setAllDebtors(true) } : undefined}>
        {allDebtors || !data.receivables.length ? 'ไม่มีใบแจ้งหนี้ที่มียอดค้าง' : 'ไม่มีลูกหนี้ที่ต้องตามวันนี้'}</EmptyNote>}
      {rows.map(row => <RowCard key={row.id} label={`${row.customerName ?? 'ยังไม่ระบุผู้จ่าย'} ค้าง ${formatMoney(row.outstanding)} บาท · เปิดใบ ${row.invoiceNumber}`}
        onPress={() => router.push(`/invoice/${row.id}`)}>
        <Text style={styles.rowTitle}>{row.customerName ?? 'ยังไม่ระบุผู้จ่าย'} · {formatMoney(row.outstanding)} ฿</Text>
        <Text style={styles.rowMeta}>{row.invoiceNumber} · {row.caseRef ?? row.subject}</Text>
        <Tag tone={row.daysOverdue ? 'due' : 'info'}>{row.daysOverdue ? `เกินกำหนด ${row.daysOverdue} วัน` : row.dueAt ? `ครบกำหนด ${thDate(row.dueAt)}` : 'ยังไม่ระบุวันครบกำหนด'}</Tag>
        <Text style={styles.rowMeta}>ผู้ติดตาม {row.collectionOwner ? `${row.collectionOwner.firstName} ${row.collectionOwner.lastName}` : '— ยังไม่มี'}
          {row.collectionNextAt ? ` · นัดติดตาม ${thDate(row.collectionNextAt)}` : ''}</Text>
        {!!row.collectionNote && <Text style={{ color: colors.warn }}>{row.collectionNote}</Text>}
      </RowCard>)}
    </>}
    {view === 'received' && data && <>
      <SectionLabel>รับเงินจริง · {thMonth(month)}</SectionLabel>
      {!data.receipts.length && <EmptyNote>ไม่มีรายการรับเงินใน {thMonth(month)}</EmptyNote>}
      {data.receipts.map(payment => <RowCard key={payment.id} label={`รับ ${formatMoney(payment.amount)} บาท ${thDate(payment.receivedAt)} · เปิดใบแจ้งหนี้`}
        onPress={() => router.push(`/invoice/${payment.invoiceId}`)}>
        <Text style={styles.rowTitle}>{formatMoney(payment.amount)} ฿ · {thDate(payment.receivedAt)}</Text>
        <Text style={styles.rowMeta}>{payment.invoice?.invoiceNumber} · {PAYMENT_METHOD_LABEL[payment.method]}</Text>
        {!!payment.note && <Text style={styles.rowMeta}>{payment.note}</Text>}
      </RowCard>)}
    </>}
    {view === 'billed' && data && <>
      <SectionLabel>วางบิลแล้ว · {thMonth(month)}</SectionLabel>
      {!data.billed.length && <EmptyNote>ไม่มีใบแจ้งหนี้วางบิลใน {thMonth(month)}</EmptyNote>}
      {data.billed.map(row => <RowCard key={row.id} label={`${row.invoiceNumber} ${formatMoney(row.totalAmount)} บาท · เปิดใบแจ้งหนี้`}
        onPress={() => router.push(`/invoice/${row.id}`)}>
        <Text style={styles.rowTitle}>{row.invoiceNumber} · {formatMoney(row.totalAmount)} ฿</Text>
        <Text style={styles.rowMeta}>{row.customerName ?? 'ยังไม่ระบุผู้จ่าย'}</Text>
        <Tag tone={row.status === 'PAID' ? 'ok' : 'info'}>{row.status === 'PAID' ? 'ชำระครบแล้ว' : 'วางบิลแล้ว'}</Tag>
      </RowCard>)}
    </>}
    {view === 'unbilled' && data && <>
      <SectionLabel>ร่างใบแจ้งหนี้ · รอบันทึกวางบิล</SectionLabel>
      {!data.drafts.length && <EmptyNote>ไม่มีร่างใบแจ้งหนี้ค้าง</EmptyNote>}
      {data.drafts.map(row => <RowCard key={row.id} label={`ร่าง ${row.invoiceNumber} ${formatMoney(row.totalAmount)} บาท · เปิดตรวจร่าง`}
        onPress={() => router.push(`/invoice/${row.id}`)}>
        <Text style={styles.rowTitle}>{row.invoiceNumber} · {formatMoney(row.totalAmount)} ฿</Text>
        <Text style={styles.rowMeta}>{row.customerName ?? 'ยังไม่ระบุผู้จ่าย'}</Text>
      </RowCard>)}
      <SectionLabel>งานที่ยังไม่สร้างใบแจ้งหนี้</SectionLabel>
      <Text style={styles.note}>ยอดจากเวลาและค่าใช้จ่ายที่บันทึกว่าเก็บกับลูกค้าได้ ไม่รวมค่าจ้างที่ยังไม่ได้ลงรายการ</Text>
      {!data.unbilled.length && <EmptyNote>ไม่มีรายการงานที่ยังไม่วางบิล</EmptyNote>}
      {data.unbilled.map(group => {
        const open = expanded === group.case.id;
        const busy = draft.isPending && draft.variables?.case.id === group.case.id;
        return <View key={group.case.id} style={[styles.row, { flexDirection: 'column', alignItems: 'stretch' }]}>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }}
            accessibilityLabel={`${group.case.ownRef} ${formatMoney(group.amount)} บาท ${group.lines.length} รายการ`}
            accessibilityHint={open ? 'แตะเพื่อย่อรายการ' : 'แตะเพื่อตรวจรายการก่อนสร้างร่างบิล'}
            onPress={() => setExpanded(open ? '' : group.case.id)} style={({ pressed }) => [styles.groupHead, pressed && { opacity: 0.7 }]}>
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle}>{group.case.ownRef} · {formatMoney(group.amount)} ฿</Text>
              <Text style={styles.rowMeta}>{group.case.title}</Text>
              <Text style={styles.rowMeta}>ทนายหลัก {group.case.leadLawyer.firstName} {group.case.leadLawyer.lastName} · {group.lines.length} รายการ</Text>
            </View>
            {open ? <ChevronDown size={18} color={colors.muted} /> : <ChevronRight size={18} color={colors.muted} />}
          </Pressable>
          {open && <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
            {group.lines.map(line => <Text key={line.id} style={styles.rowMeta}>{thDate(line.date)} · {line.description} · {formatMoney(line.amount)} ฿</Text>)}
            <Button title="สร้างร่างใบแจ้งหนี้" disabled={finance.isError || finance.isFetching || group.amount <= 0 || (draft.isPending && !busy)} busy={busy}
              onPress={() => Alert.alert('สร้างร่างใบแจ้งหนี้', `${group.case.ownRef} · ${group.lines.length} รายการ · ${formatMoney(group.amount)} ฿\nแบ่งตามผู้จ่ายของคดีที่ตั้งไว้ เปิดตรวจร่างก่อนวางบิล`, [
                { text: 'ยกเลิก', style: 'cancel' }, { text: 'สร้างร่าง', onPress: () => draft.mutate(group) },
              ])} />
            <Button title="เปิดคดี / ตรวจข้อมูลผู้จ่าย" variant="link" onPress={() => router.push(`/case/${group.case.id}`)} />
          </View>}
        </View>;
      })}
    </>}
    {view === 'payable' && data && <>
      <SectionLabel>ค่าใช้จ่ายอนุมัติแล้วรอจ่าย</SectionLabel>
      {!data.payable.length && <EmptyNote>ไม่มีรายการอนุมัติแล้วรอจ่าย</EmptyNote>}
      {data.payable.map(expense => <RowCard key={expense.id}
        label={`${expense.description} ${formatMoney(expense.amount)} บาท · ${expense.claimId ? 'เปิดชุดเบิก' : 'เปิดรายการค่าใช้จ่าย'}`}
        onPress={() => router.push(expense.claimId ? `/expenses/claim/${expense.claimId}` : '/expenses')}>
        <Text style={styles.rowTitle}>{expense.description} · {formatMoney(expense.amount)} ฿</Text>
        <Text style={styles.rowMeta}>{expense.case?.ownRef ?? 'ค่าใช้จ่ายสำนักงาน'} · {expense.user.firstName} {expense.user.lastName}</Text>
      </RowCard>)}
    </>}
    {data && <Text style={styles.note}>ยอดเหล่านี้เป็นรายการรับเงิน วางบิล และภาระรอรับ/รอจ่าย ยังไม่ใช่กำไรสำนักงาน</Text>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: TOUCH, padding: spacing.md,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.card },
  rowBody: { flex: 1, minWidth: 0, gap: spacing.xs },
  rowTitle: { fontWeight: '700', fontSize: 16, color: colors.ink },
  rowMeta: { color: colors.muted, fontSize: 14, lineHeight: 22 },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: TOUCH },
  note: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.button, backgroundColor: colors.surface },
  stepperButton: { width: TOUCH, height: TOUCH, alignItems: 'center', justifyContent: 'center', borderRadius: radius.button },
  stepperLabel: { flex: 1, textAlign: 'center', fontSize: 17, fontFamily: fonts.bold, color: colors.ink },
});
