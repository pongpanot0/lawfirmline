import React, { useCallback, useState } from 'react';
import { Alert, RefreshControl, ScrollView } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/api/auth';
import { api } from '@/api/client';
import { useOwnerFinance } from '@/api/hooks';
import { PAYMENT_METHOD_LABEL, type UnbilledCase } from '@/api/types';
import { Text } from '@/components/AppText';
import { Button, Card, EmptyNote, ErrorNote, FilterTabs, Loading, PageIntro, SectionLabel, Tag } from '@/components/ui';
import { OwnerFinanceSummary, FinanceView } from '@/components/OwnerFinanceSummary';
import { DatePicker } from '@/components/DatePicker';
import { bangkokDay, formatMoney, thDate } from '@/format';
import { colors, pageContent, spacing } from '@/theme';

const VIEWS: Array<{ value: FinanceView; label: string }> = [
  { value: 'receivables', label: 'ลูกหนี้' }, { value: 'received', label: 'เงินรับแล้ว' },
  { value: 'billed', label: 'วางบิล / ร่างบิล' }, { value: 'unbilled', label: 'ยังไม่วางบิล' }, { value: 'payable', label: 'รอจ่าย' },
];

export default function OwnerFinanceScreen() {
  const params = useLocalSearchParams<{ view?: string }>();
  const { user } = useAuth(), owner = user?.firmRole === 'OWNER';
  const router = useRouter(), client = useQueryClient();
  const today = bangkokDay(new Date().toISOString());
  const [view, setView] = useState<FinanceView>(VIEWS.some(item => item.value === params.view) ? params.view as FinanceView : 'receivables');
  const [month, setMonth] = useState(today.slice(0, 7)), [changeMonth, setChangeMonth] = useState(false);
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
      else { setView('billed'); Alert.alert('สร้างร่างแล้ว', `แบ่งตามผู้จ่าย ${invoices.length} ใบ เปิดตรวจแต่ละใบก่อนบันทึกวางบิล`); }
    },
    onError: error => { void finance.refetch(); Alert.alert('สร้างร่างไม่สำเร็จ', `${error.message}\nตรวจรายการร่างล่าสุดก่อนทำอีกครั้ง`); },
  });
  if (!owner) return <EmptyNote>ข้อมูลการเงินสำนักงานสำหรับ Owner</EmptyNote>;
  const data = finance.data;
  const rows = data?.receivables.filter(row => allDebtors || row.daysOverdue > 0 || !row.dueAt || !row.collectionOwner || (!!row.collectionNextAt && row.collectionNextAt <= today))
    .sort((a, b) => b.daysOverdue - a.daysOverdue || (a.collectionNextAt ?? '9999').localeCompare(b.collectionNextAt ?? '9999')) ?? [];
  return <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ ...pageContent, gap: spacing.sm }}
    refreshControl={<RefreshControl refreshing={finance.isRefetching} onRefresh={() => finance.refetch()} />}>
    <Stack.Screen options={{ title: 'เงินสำนักงาน / ลูกหนี้' }} />
    <PageIntro title="การเงินสำนักงาน" detail="ตรวจยอดค้าง รับเงิน และติดตามใบแจ้งหนี้" />
    <Text style={{ color: colors.muted }}>รับเงินและวางบิล: {month} · ยังไม่วางบิล รอจ่าย และลูกหนี้: ยอดที่ยังค้างทั้งหมด</Text>
    <Button title={changeMonth ? 'ปิดตัวเลือกเดือน' : 'เปลี่ยนเดือนที่ดูรับเงิน / วางบิล'} ghost onPress={() => setChangeMonth(!changeMonth)} />
    {changeMonth && <><Text>เลือกวันที่ในเดือนที่ต้องการดู</Text><DatePicker value={`${month}-01`} onChange={value => setMonth(value.slice(0, 7))} /></>}
    {finance.isError && <ErrorNote message="โหลดข้อมูลการเงินล่าสุดไม่ได้ กรุณาลองใหม่ก่อนทำรายการ" onRetry={() => finance.refetch()} />}
    {finance.isLoading && <Loading />}
    <OwnerFinanceSummary data={data} onOpen={setView} />
    <FilterTabs items={VIEWS} value={view} onChange={value => setView(value as FinanceView)} />
    {view === 'receivables' && <>
      <SectionLabel>ลูกหนี้ที่ต้องตาม · ยอดค้างทั้งหมด {data ? `${formatMoney(data.totals.receivable)} ฿` : '—'}</SectionLabel>
      <Text style={{ color: colors.muted }}>คิวต้องตามรวมเกินกำหนด นัดติดตามถึงวันนี้ ยังไม่มีผู้ติดตาม หรือยังไม่ระบุวันครบกำหนด</Text>
      <Button title={allDebtors ? 'แสดงเฉพาะที่ต้องตาม' : 'แสดงลูกหนี้ทั้งหมด'} ghost onPress={() => setAllDebtors(!allDebtors)} />
      {data && !rows.length && <EmptyNote>{allDebtors ? 'ไม่มีใบแจ้งหนี้ที่มียอดค้าง' : 'ไม่มีลูกหนี้เข้าเงื่อนไขต้องตามวันนี้ · เปิดทั้งหมดเพื่อดูใบที่ยังไม่ถึงกำหนด'}</EmptyNote>}
      {rows.map(row => <Card key={row.id} style={{ gap: spacing.sm }}>
        <Text style={{ fontWeight: '700', fontSize: 16 }}>{row.customerName ?? 'ยังไม่ระบุผู้จ่าย'} · {formatMoney(row.outstanding)} ฿</Text>
        <Text>{row.invoiceNumber} · {row.caseRef ?? row.subject}</Text>
        <Tag tone={row.daysOverdue ? 'due' : 'info'}>{row.daysOverdue ? `เกินกำหนด ${row.daysOverdue} วัน` : row.dueAt ? `ครบกำหนด ${thDate(row.dueAt)}` : 'ยังไม่ระบุวันครบกำหนด'}</Tag>
        <Text>ผู้ติดตาม: {row.collectionOwner ? `${row.collectionOwner.firstName} ${row.collectionOwner.lastName}` : 'ยังไม่มีคนรับผิดชอบ'}</Text>
        <Text>นัดติดตาม: {row.collectionNextAt ? thDate(row.collectionNextAt) : 'ยังไม่ระบุ'}</Text>
        {!!row.collectionNote && <Text style={{ color: colors.warn }}>{row.collectionNote}</Text>}
        <Button title={`เปิดใบ ${row.invoiceNumber} / จัดการ`} ghost onPress={() => router.push(`/invoice/${row.id}`)} />
      </Card>)}
    </>}
    {view === 'received' && <>
      <SectionLabel>ประวัติรับเงินจริง · {month}</SectionLabel>
      {data && !data.receipts.length && <EmptyNote>ไม่มีรายการรับเงินในเดือนนี้</EmptyNote>}
      {data?.receipts.map(payment => <Card key={payment.id} style={{ gap: spacing.sm }}><Text style={{ fontWeight: '700' }}>{formatMoney(payment.amount)} ฿ · {thDate(payment.receivedAt)}</Text>
        <Text>{payment.invoice?.invoiceNumber} · {PAYMENT_METHOD_LABEL[payment.method]}</Text>{!!payment.note && <Text>{payment.note}</Text>}
        <Button title="เปิดใบแจ้งหนี้ / ประวัติรับเงิน" ghost onPress={() => router.push(`/invoice/${payment.invoiceId}`)} />
      </Card>)}
    </>}
    {view === 'billed' && <>
      <SectionLabel>วางบิลแล้ว · {month}</SectionLabel>
      {data && !data.billed.length && <EmptyNote>ไม่มีใบแจ้งหนี้วางบิลในเดือนนี้</EmptyNote>}
      {[...(data?.billed ?? []), ...(data?.drafts ?? [])].map(row => <Card key={row.id} style={{ gap: spacing.sm }}>
        <Tag tone={row.status === 'DRAFT' ? 'plain' : row.status === 'PAID' ? 'ok' : 'info'}>{row.status === 'DRAFT' ? 'ร่าง · ยังไม่รวมในยอดวางบิล' : row.status === 'PAID' ? 'ชำระครบแล้ว' : 'วางบิลแล้ว'}</Tag>
        <Text style={{ fontWeight: '700' }}>{row.invoiceNumber} · {formatMoney(row.totalAmount)} ฿</Text><Text>{row.customerName ?? 'ยังไม่ระบุผู้จ่าย'}</Text>
        <Button title="เปิดตรวจรายละเอียดใบแจ้งหนี้" ghost onPress={() => router.push(`/invoice/${row.id}`)} />
      </Card>)}
    </>}
    {view === 'unbilled' && <>
      <SectionLabel>ร่างใบแจ้งหนี้ที่ยังไม่วางบิล</SectionLabel>
      {data?.drafts.map(row => <Card key={row.id} style={{ gap: spacing.sm }}><Text>{row.invoiceNumber} · {row.customerName ?? 'ยังไม่ระบุผู้จ่าย'} · {formatMoney(row.totalAmount)} ฿</Text>
        <Button title="เปิดตรวจร่าง / บันทึกวางบิล" ghost onPress={() => router.push(`/invoice/${row.id}`)} /></Card>)}
      {data && !data.drafts.length && <EmptyNote>ไม่มีร่างใบแจ้งหนี้ค้าง</EmptyNote>}
      <SectionLabel>งานที่ยังไม่สร้างใบแจ้งหนี้</SectionLabel>
      <Text style={{ color: colors.muted }}>ยอดจากเวลาและค่าใช้จ่ายที่บันทึกว่าเก็บกับลูกค้าได้ ไม่รวมค่าจ้างที่ยังไม่ได้ลงรายการ</Text>
      {data && !data.unbilled.length && <EmptyNote>ไม่มีรายการงานที่ยังไม่วางบิล</EmptyNote>}
      {data?.unbilled.map(group => <Card key={group.case.id} style={{ gap: spacing.sm }}>
        <Text style={{ fontWeight: '700' }}>{group.case.ownRef} · {formatMoney(group.amount)} ฿</Text><Text>{group.case.title}</Text>
        <Text>ทนายหลัก: {group.case.leadLawyer.firstName} {group.case.leadLawyer.lastName} · {group.lines.length} รายการ</Text>
        <Button title={expanded === group.case.id ? 'ย่อรายการงาน' : 'ตรวจรายการก่อนสร้างร่างบิล'} ghost onPress={() => setExpanded(expanded === group.case.id ? '' : group.case.id)} />
        {expanded === group.case.id && <>
          {group.lines.map(line => <Text key={line.id}>{thDate(line.date)} · {line.description} · {formatMoney(line.amount)} ฿</Text>)}
          <Button title="สร้างร่างใบแจ้งหนี้จากรายการนี้" disabled={finance.isError || finance.isFetching || group.amount <= 0} busy={draft.isPending}
            onPress={() => Alert.alert('สร้างร่างใบแจ้งหนี้', `${group.case.ownRef} · ${group.lines.length} รายการ · ${formatMoney(group.amount)} ฿\nแบ่งตามผู้จ่ายของคดีที่ตั้งไว้ เปิดตรวจร่างก่อนวางบิล`, [
              { text: 'ยกเลิก', style: 'cancel' }, { text: 'สร้างร่าง', onPress: () => draft.mutate(group) },
            ])} />
          <Button title="เปิดคดี / ตรวจข้อมูลผู้จ่าย" ghost onPress={() => router.push(`/case/${group.case.id}`)} />
        </>}
      </Card>)}
    </>}
    {view === 'payable' && <>
      <SectionLabel>ค่าใช้จ่ายอนุมัติแล้วรอจ่าย</SectionLabel>
      {data && !data.payable.length && <EmptyNote>ไม่มีรายการอนุมัติแล้วรอจ่าย</EmptyNote>}
      {data?.payable.map(expense => <Card key={expense.id} style={{ gap: spacing.sm }}><Text style={{ fontWeight: '700' }}>{expense.description} · {formatMoney(expense.amount)} ฿</Text>
        <Text>{expense.case?.ownRef ?? 'ค่าใช้จ่ายสำนักงาน'} · {expense.user.firstName} {expense.user.lastName}</Text>
        <Button title={expense.claimId ? 'เปิดชุดเบิก / บันทึกจ่ายเงินจริง' : 'เปิดรายการค่าใช้จ่าย'} ghost onPress={() => router.push(expense.claimId ? `/expenses/claim/${expense.claimId}` : '/expenses')} />
      </Card>)}
    </>}
    <Text style={{ color: colors.faint }}>ยอดเหล่านี้เป็นรายการรับเงิน วางบิล และภาระรอรับ/รอจ่าย ยังไม่ใช่กำไรสำนักงาน</Text>
  </ScrollView>;
}
