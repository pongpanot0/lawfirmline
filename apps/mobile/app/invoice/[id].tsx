import React, { useCallback, useState } from 'react';
import { Alert, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/api/auth';
import { api } from '@/api/client';
import { taskDraftScope } from '@/api/drafts';
import { useMembers } from '@/api/hooks';
import { PAYMENT_METHOD_LABEL, type CollectionDetail, type InvoicePaymentItem } from '@/api/types';
import { useTaskDraft } from '@/hooks/useTaskDraft';
import { Text } from '@/components/AppText';
import { Button, Card, EmptyNote, ErrorNote, Loading, SectionLabel, Tag } from '@/components/ui';
import { FormField, FormPage, FormSection } from '@/components/Form';
import { Dropdown } from '@/components/Dropdown';
import { DatePicker } from '@/components/DatePicker';
import { bangkokDay, formatMoney, thDate } from '@/format';
import { colors, spacing } from '@/theme';

type Tracking = { ownerId: string; nextAt: string; note: string; updatedAt: string };
type Payment = { amount: string; receivedAt: string; method: InvoicePaymentItem['method']; note: string; createRequestId: string };
const requestId = () => `mobile-payment-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;

export default function InvoiceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(), { user } = useAuth(), router = useRouter(), client = useQueryClient();
  const owner = user?.firmRole === 'OWNER', today = bangkokDay(new Date().toISOString());
  const invoice = useQuery({ queryKey: ['collection-invoice', id], enabled: owner && !!id, queryFn: () => api<CollectionDetail>(`/invoices/${id}/collection`) });
  const members = useMembers();
  useFocusEffect(useCallback(() => { if (owner) void invoice.refetch(); }, [owner, invoice.refetch]));
  const [tracking, setTracking] = useState<Tracking | null>(null), [payment, setPayment] = useState<Payment | null>(null);
  const draft = useTaskDraft(user && owner ? `${taskDraftScope(user)}invoice:${id}` : null, { tracking, payment, files: [] }, value => { setTracking(value.tracking); setPayment(value.payment); }, !!tracking || !!payment,
    { name: `ร่างติดตาม / รับเงิน ${invoice.data?.invoiceNumber ?? ''}`, route: `/invoice/${id}` });
  const refreshMoney = () => { for (const key of ['owner-finance', 'owner-kpis', 'collection-invoice']) void client.invalidateQueries({ queryKey: [key] }); };
  const saveTracking = useMutation({ retry: false,
    mutationFn: (value: Tracking) => api<CollectionDetail>(`/invoices/${id}/follow-up`, { method: 'PATCH', body: { ...value, ownerId: value.ownerId || null, nextAt: value.nextAt || null, note: value.note.trim() || null } }),
    onSuccess: () => { setTracking(null); refreshMoney(); Alert.alert('บันทึกการติดตามแล้ว'); },
    onError: error => { void invoice.refetch(); Alert.alert('บันทึกการติดตามไม่สำเร็จ', error.message); },
  });
  const receive = useMutation({ retry: false,
    mutationFn: (value: Payment) => api(`/invoices/${id}/payments`, { method: 'POST', body: { ...value, amount: Number(value.amount), note: value.note.trim() || undefined } }),
    onSuccess: () => { setPayment(null); refreshMoney(); Alert.alert('บันทึกรับเงินจริงแล้ว'); },
    onError: async (error, value) => {
      const fresh = await invoice.refetch();
      if (fresh.data?.payments.some(row => row.createRequestId === value.createRequestId)) {
        setPayment(null); refreshMoney(); Alert.alert('ตรวจพบรายการรับเงินที่บันทึกแล้ว', 'ไม่ได้สร้างรายการซ้ำ');
      } else Alert.alert('ยังยืนยันผลรับเงินไม่ได้', `${error.message}\nตรวจประวัติรับเงินก่อนลองอีกครั้ง ร่างเดิมใช้คีย์เดิมเพื่อกันซ้ำ`);
    },
  });
  const issue = useMutation({ retry: false,
    mutationFn: () => api(`/invoices/${id}/send`, { method: 'PATCH' }),
    onSuccess: () => { refreshMoney(); Alert.alert('บันทึกวางบิลแล้ว'); },
    onError: error => { void invoice.refetch(); Alert.alert('บันทึกวางบิลไม่สำเร็จ', `${error.message}\nตรวจสถานะล่าสุดก่อนทำอีกครั้ง`); },
  });
  if (!owner) return <EmptyNote>ข้อมูลการเงินสำหรับ Owner</EmptyNote>;
  if (invoice.isLoading) return <Loading />;
  const data = invoice.data;
  if (!data) return <ErrorNote message="โหลดใบแจ้งหนี้ไม่ได้" onRetry={() => invoice.refetch()} />;
  const busy = saveTracking.isPending || receive.isPending || issue.isPending;
  const disabled = busy || invoice.isError || invoice.isFetching || !draft.ready;
  const patchPayment = (patch: Partial<Payment>) => setPayment(value => value ? { ...value, ...patch, createRequestId: requestId() } : null);
  return <FormPage>
    <Stack.Screen options={{ title: data.invoiceNumber }} />
    {invoice.isError && <ErrorNote message="ตรวจสถานะล่าสุดไม่ได้ กรุณาโหลดใหม่ก่อนทำรายการ" onRetry={() => invoice.refetch()} />}
    <Card style={{ gap: spacing.sm }}>
      <Tag tone={data.status === 'PAID' ? 'ok' : 'info'}>{data.status === 'DRAFT' ? 'ร่าง · ยังไม่วางบิล' : data.status === 'PAID' ? 'สถานะชำระครบแล้ว' : 'วางบิลแล้ว'}</Tag>
      <Text style={{ fontWeight: '700', fontSize: 20 }}>{data.customerName ?? 'ยังไม่ระบุผู้จ่าย'}</Text><Text>{data.caseRef ?? data.subject}</Text>
      <Text>ยอดใบแจ้งหนี้ {formatMoney(data.totalAmount)} ฿</Text>
      <Text style={{ color: colors.good }}>บันทึกรับเงินจริงแล้ว {formatMoney(data.paidAmount)} ฿</Text>
      {data.status !== 'DRAFT' && <Text style={{ color: colors.warn, fontWeight: '700' }}>คงเหลือจากรายการรับเงิน {formatMoney(data.outstanding)} ฿</Text>}
      <Text>ครบกำหนด: {data.dueAt ? thDate(data.dueAt) : 'ยังไม่ระบุ'}</Text>
      {data.daysOverdue > 0 && data.status === 'SENT' && <Text style={{ color: colors.warn }}>เกินกำหนด {data.daysOverdue} วัน</Text>}
      {data.caseId && <Button title="เปิดคดีที่เกี่ยวข้อง" ghost onPress={() => router.push(`/case/${data.caseId}`)} />}
    </Card>
    <SectionLabel>รายการในใบแจ้งหนี้</SectionLabel>
    {data.lineItems.map(line => <Card key={line.id}><Text>{line.description}</Text><Text>{line.quantity} × {formatMoney(line.unitPrice)} = {formatMoney(line.amount)} ฿</Text></Card>)}
    {!data.lineItems.length && <EmptyNote>ไม่มีรายการในใบแจ้งหนี้</EmptyNote>}
    {data.status === 'DRAFT' && <Button title="บันทึกว่าวางบิลแล้ว" disabled={disabled || data.totalAmount <= 0 || !data.lineItems.length} busy={issue.isPending}
      onPress={() => Alert.alert('ยืนยันว่าได้วางบิลแล้ว', `${data.invoiceNumber} · ${data.customerName ?? 'ยังไม่ระบุผู้จ่าย'} · ${formatMoney(data.totalAmount)} ฿\nครบกำหนด ${data.dueAt ? thDate(data.dueAt) : thDate(new Date(Date.now() + 30 * 86400000))}\nบันทึกสถานะการวางบิล ไม่มีการส่งข้อความให้ลูกค้า`, [
        { text: 'ยกเลิก', style: 'cancel' }, { text: 'บันทึกวางบิล', onPress: () => issue.mutate() },
      ])} />}
    {data.status === 'SENT' && <>
      <SectionLabel>ผู้ติดตามและปัญหาค้าง</SectionLabel>
      <Card style={{ gap: spacing.sm }}>
        <Text>ผู้ติดตาม: {data.collectionOwner ? `${data.collectionOwner.firstName} ${data.collectionOwner.lastName}` : 'ยังไม่ระบุ'}</Text>
        <Text>นัดติดตาม: {data.collectionNextAt ? thDate(data.collectionNextAt) : 'ยังไม่ระบุ'}</Text>
        <Text>{data.collectionNote ?? 'ยังไม่มีบันทึกผลติดตาม / ปัญหา'}</Text>
        {!tracking && <Button title="บันทึกผู้ติดตาม / วันนัด / ปัญหา" ghost disabled={disabled} onPress={() => setTracking({ ownerId: data.collectionOwner?.id ?? user!.id, nextAt: data.collectionNextAt ?? today, note: data.collectionNote ?? '', updatedAt: data.updatedAt })} />}
      </Card>
      {tracking && <FormSection title="บันทึกการติดตาม">
        {members.isError && <ErrorNote message="โหลดรายชื่อผู้ติดตามไม่ได้" onRetry={() => members.refetch()} />}
        <Dropdown label="ผู้รับผิดชอบติดตาม" value={tracking.ownerId} disabled={busy} onChange={ownerId => setTracking({ ...tracking, ownerId })}
          options={[{ value: '', label: 'ยังไม่ระบุผู้ติดตาม' }, ...(members.data ?? []).map(member => ({ value: member.id, label: `${member.firstName} ${member.lastName}` }))]} />
        <SectionLabel>วันติดตามถัดไป</SectionLabel>{busy ? <Text>{tracking.nextAt ? thDate(tracking.nextAt) : 'ยังไม่ระบุ'}</Text> : <DatePicker value={tracking.nextAt} onChange={nextAt => setTracking({ ...tracking, nextAt })} />}
        <Button title="ล้างวันติดตาม" ghost disabled={busy} onPress={() => setTracking({ ...tracking, nextAt: '' })} />
        <FormField label="ผลติดตาม / ปัญหาที่ยังค้าง" value={tracking.note} multiline disabled={busy} onChange={note => setTracking({ ...tracking, note })} />
        {tracking.updatedAt !== data.updatedAt && <><Text style={{ color: colors.warn }}>ข้อมูลใบนี้เปลี่ยนแล้ว ตรวจสถานะล่าสุดก่อนบันทึกร่างนี้</Text>
          <Button title="ใช้สถานะล่าสุดและคงข้อความร่าง" ghost disabled={disabled} onPress={() => setTracking({ ...tracking, updatedAt: data.updatedAt })} /></>}
        <Button title="บันทึกการติดตาม" disabled={disabled || tracking.updatedAt !== data.updatedAt} busy={saveTracking.isPending} onPress={() => saveTracking.mutate(tracking)} />
        <Button title="ยกเลิกร่างการติดตาม" ghost disabled={busy} onPress={() => setTracking(null)} />
      </FormSection>}
      {!payment && <Button title="บันทึกรับเงินจริง" disabled={disabled} onPress={() => setPayment({ amount: String(data.outstanding), receivedAt: today, method: 'TRANSFER', note: '', createRequestId: requestId() })} />}
      {payment && <FormSection title="รับเงินตามหลักฐานการชำระ">
        <FormField label="จำนวนเงินที่รับจริง (บาท)" value={payment.amount} disabled={busy} onChange={amount => patchPayment({ amount })} placeholder="เช่น 1000.00" />
        <SectionLabel>วันที่รับเงินจริง</SectionLabel>{busy ? <Text>{thDate(payment.receivedAt)}</Text> : <DatePicker value={payment.receivedAt} onChange={receivedAt => patchPayment({ receivedAt })} />}
        <Dropdown label="ช่องทางรับเงิน" value={payment.method} disabled={busy} options={Object.entries(PAYMENT_METHOD_LABEL).map(([value, label]) => ({ value, label }))} onChange={method => patchPayment({ method: method as Payment['method'] })} />
        <FormField label="เลขอ้างอิง / หมายเหตุการรับเงิน" value={payment.note} disabled={busy} onChange={note => patchPayment({ note })} />
        <Button title="ตรวจและยืนยันรับเงิน" disabled={disabled} busy={receive.isPending} onPress={() => {
          const amount = Number(payment.amount);
          if (!/^\d+(?:\.\d{1,2})?$/.test(payment.amount) || amount <= 0 || amount > data.outstanding || payment.receivedAt > today) return Alert.alert('ตรวจจำนวนเงินและวันที่', 'ยอดรับต้องมากกว่า 0 ไม่เกินยอดค้าง และวันที่ต้องไม่อยู่ในอนาคต');
          Alert.alert('ยืนยันรับเงินจริง', `${data.invoiceNumber} · ${formatMoney(amount)} ฿\n${thDate(payment.receivedAt)} · ${PAYMENT_METHOD_LABEL[payment.method]}\nยืนยันตามหลักฐานการชำระที่ตรวจแล้ว`, [{ text: 'ยกเลิก', style: 'cancel' }, { text: 'บันทึกรับเงิน', onPress: () => receive.mutate(payment) }]);
        }} />
        <Button title="ยกเลิกร่างรับเงิน" ghost disabled={busy} onPress={() => setPayment(null)} />
      </FormSection>}
    </>}
    {(tracking || payment) && <View>{draft.message ? <Text style={{ color: colors.info }}>{draft.message}</Text> : null}
      {draft.error ? <ErrorNote message={draft.error} onRetry={draft.retry} /> : null}</View>}
    {(tracking || payment) && data.status !== 'SENT' && <Card><Text>ใบนี้ไม่อยู่ในสถานะรอติดตามแล้ว ร่างยังเก็บไว้ให้ตรวจเทียบกับประวัติรับเงิน</Text>
      <Button title="ล้างร่างที่ไม่ต้องใช้แล้ว" ghost onPress={() => { setTracking(null); setPayment(null); }} /></Card>}
    <SectionLabel>ประวัติรับเงินจริง · ทุกเดือน</SectionLabel>
    {!data.payments.length && <EmptyNote>ยังไม่มีรายการรับเงินจริงสำหรับใบนี้</EmptyNote>}
    {data.payments.map(row => <Card key={row.id}><Text style={{ fontWeight: '700' }}>{formatMoney(row.amount)} ฿ · {thDate(row.receivedAt)}</Text>
      <Text>{PAYMENT_METHOD_LABEL[row.method]}</Text>{!!row.note && <Text>{row.note}</Text>}</Card>)}
  </FormPage>;
}
