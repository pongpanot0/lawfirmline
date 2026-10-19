import React, { useCallback, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { hasFirmCapability } from '@lawfirm/shared';
import { useAuth } from '@/api/auth';
import { api } from '@/api/client';
import { taskDraftScope } from '@/api/drafts';
import { useMembers } from '@/api/hooks';
import { PAYMENT_METHOD_LABEL, type CollectionDetail, type InvoicePaymentItem } from '@/api/types';
import { useTaskDraft } from '@/hooks/useTaskDraft';
import { Text } from '@/components/AppText';
import { CircleCheck } from 'lucide-react-native';
import { Button, Card, EmptyState, ErrorState, InlineError, LoadingState, SectionLabel, Tag } from '@/components/ui';
import { FormPage, FormSection, MissingSummary } from '@/components/Form';
import { TextArea, TextField } from '@/components/Input';
import { Dropdown } from '@/components/Dropdown';
import { DatePicker } from '@/components/DatePicker';
import { bangkokDay, formatMoney, thDate } from '@/format';
import { colors, fonts, radius, spacing, typeScale } from '@/theme';

type Tracking = { ownerId: string; nextAt: string; note: string; updatedAt: string };
type Payment = { amount: string; receivedAt: string; method: InvoicePaymentItem['method']; note: string; createRequestId: string };
const requestId = () => `mobile-payment-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;

export default function InvoiceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(), { user } = useAuth(), router = useRouter(), client = useQueryClient();
  const owner = hasFirmCapability(user?.firmRole, 'manageInvoices'), today = bangkokDay(new Date().toISOString());
  const invoice = useQuery({ queryKey: ['collection-invoice', id], enabled: owner && !!id, queryFn: () => api<CollectionDetail>(`/invoices/${id}/collection`) });
  const members = useMembers();
  useFocusEffect(useCallback(() => { if (owner) void invoice.refetch(); }, [owner, invoice.refetch]));
  const [tracking, setTracking] = useState<Tracking | null>(null), [payment, setPayment] = useState<Payment | null>(null);
  const [triedPay, setTriedPay] = useState(false);
  // Results show in place; a dialog is kept only for the confirmations that record money or status.
  const [notice, setNotice] = useState(''), [actionError, setActionError] = useState('');
  const draft = useTaskDraft(user && owner ? `${taskDraftScope(user)}invoice:${id}` : null, { tracking, payment, files: [] }, value => { setTracking(value.tracking); setPayment(value.payment); }, !!tracking || !!payment,
    { name: `ร่างติดตาม / รับเงิน ${invoice.data?.invoiceNumber ?? ''}`, route: `/invoice/${id}` });
  const refreshMoney = () => { for (const key of ['owner-finance', 'owner-kpis', 'collection-invoice']) void client.invalidateQueries({ queryKey: [key] }); };
  const saveTracking = useMutation({ retry: false,
    mutationFn: (value: Tracking) => api<CollectionDetail>(`/invoices/${id}/follow-up`, { method: 'PATCH', body: { ...value, ownerId: value.ownerId || null, nextAt: value.nextAt || null, note: value.note.trim() || null } }),
    onSuccess: () => { setTracking(null); refreshMoney(); setNotice('บันทึกการติดตามแล้ว'); },
    onError: error => { void invoice.refetch(); setActionError(`บันทึกการติดตามไม่สำเร็จ · ${error.message}`); },
  });
  const receive = useMutation({ retry: false,
    mutationFn: (value: Payment) => api(`/invoices/${id}/payments`, { method: 'POST', body: { ...value, amount: Number(value.amount), note: value.note.trim() || undefined } }),
    onSuccess: () => { setPayment(null); setTriedPay(false); refreshMoney(); setNotice('บันทึกรับเงินจริงแล้ว'); },
    onError: async (error, value) => {
      const fresh = await invoice.refetch();
      if (fresh.data?.payments.some(row => row.createRequestId === value.createRequestId)) {
        setPayment(null); setTriedPay(false); refreshMoney(); setNotice('ตรวจพบรายการรับเงินที่บันทึกแล้ว · ไม่ได้สร้างรายการซ้ำ');
      } else setActionError(`ยังยืนยันผลรับเงินไม่ได้ · ${error.message} · ตรวจประวัติรับเงินก่อนลองอีกครั้ง ร่างเดิมใช้คีย์เดิมเพื่อกันซ้ำ`);
    },
  });
  const issue = useMutation({ retry: false,
    mutationFn: () => api(`/invoices/${id}/send`, { method: 'PATCH' }),
    onSuccess: () => { refreshMoney(); setNotice('บันทึกวางบิลแล้ว'); },
    onError: error => { void invoice.refetch(); setActionError(`บันทึกวางบิลไม่สำเร็จ · ${error.message} · ตรวจสถานะล่าสุดก่อนทำอีกครั้ง`); },
  });
  if (!owner) return <View style={styles.statePage}><EmptyState>ข้อมูลการเงินสำหรับเจ้าของและผู้จัดการสำนักงาน</EmptyState></View>;
  if (invoice.isLoading) return <LoadingState label="กำลังโหลดใบแจ้งหนี้…" />;
  const data = invoice.data;
  if (!data) return <FormPage><ErrorState message="โหลดใบแจ้งหนี้ไม่ได้" onRetry={() => invoice.refetch()} /></FormPage>;
  const busy = saveTracking.isPending || receive.isPending || issue.isPending;
  const disabled = busy || invoice.isError || invoice.isFetching || !draft.ready;
  const patchPayment = (patch: Partial<Payment>) => setPayment(value => value ? { ...value, ...patch, createRequestId: requestId() } : null);
  const startAction = () => { setNotice(''); setActionError(''); };
  const amount = payment ? Number(payment.amount) : 0;
  const payErrors = payment ? {
    amount: !/^\d+(?:\.\d{1,2})?$/.test(payment.amount) || amount <= 0 ? 'ใส่ยอดรับมากกว่า 0 (ทศนิยมไม่เกิน 2 หลัก)'
      : amount > data.outstanding ? `ยอดรับต้องไม่เกินยอดค้าง ${formatMoney(data.outstanding)} ฿` : undefined,
    receivedAt: payment.receivedAt > today ? 'วันที่รับเงินต้องไม่เกินวันนี้' : undefined,
  } : { amount: undefined, receivedAt: undefined };
  const payMissing = triedPay ? [payErrors.amount && 'จำนวนเงินที่รับจริง', payErrors.receivedAt && 'วันที่รับเงินจริง'].filter((item): item is string => !!item) : [];
  const sent = data.status === 'SENT';
  return <FormPage>
    <Stack.Screen options={{ title: data.invoiceNumber }} />
    {invoice.isError && <InlineError message="ตรวจสถานะล่าสุดไม่ได้ กรุณาโหลดใหม่ก่อนทำรายการ" onRetry={() => invoice.refetch()} />}
    {notice ? <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.notice}>
      <CircleCheck size={18} color={colors.good} style={{ marginTop: 2 }} />
      <Text style={{ flex: 1, color: colors.good, fontWeight: '600' }}>{notice}</Text>
    </View> : null}
    <Card style={{ gap: spacing.sm }}>
      <Tag tone={data.status === 'PAID' ? 'ok' : 'info'}>{data.status === 'DRAFT' ? 'ร่าง · ยังไม่วางบิล' : data.status === 'PAID' ? 'ชำระครบแล้ว' : 'วางบิลแล้ว'}</Tag>
      <View style={{ gap: 2 }}>
        <Text accessibilityRole="header" style={styles.payer}>{data.customerName ?? 'ยังไม่ระบุผู้จ่าย'}</Text>
        <Text style={styles.meta}>{data.caseRef ?? data.subject}</Text>
      </View>
      {sent ? <>
        <Text style={styles.overline}>ยอดค้างชำระ</Text>
        <Text accessibilityLabel={`ยอดค้างชำระ ${formatMoney(data.outstanding)} บาท`} style={styles.big}>{formatMoney(data.outstanding)} ฿</Text>
        <Text style={styles.meta}>จากยอดใบแจ้งหนี้ {formatMoney(data.totalAmount)} ฿ · รับแล้ว {formatMoney(data.paidAmount)} ฿</Text>
      </> : <>
        <Text accessibilityLabel={`ยอดใบแจ้งหนี้ ${formatMoney(data.totalAmount)} บาท`} style={styles.big}>{formatMoney(data.totalAmount)} ฿</Text>
        {data.paidAmount > 0 && <Text style={{ color: colors.good }}>บันทึกรับเงินจริงแล้ว {formatMoney(data.paidAmount)} ฿</Text>}
      </>}
      <Text style={[styles.due, data.daysOverdue > 0 && sent ? { color: colors.warn, fontWeight: '600' } : styles.meta]}>
        ครบกำหนด {data.dueAt ? thDate(data.dueAt) : '— ยังไม่ระบุ'}{data.daysOverdue > 0 && sent ? ` · เกินกำหนด ${data.daysOverdue} วัน` : ''}</Text>
      {data.caseId && <Button title="เปิดคดีที่เกี่ยวข้อง" variant="link" onPress={() => router.push(`/case/${data.caseId}`)} />}
    </Card>
    <SectionLabel>รายการในใบแจ้งหนี้</SectionLabel>
    {data.lineItems.length ? <Card style={{ paddingVertical: spacing.xs }}>
      {data.lineItems.map((line, index) => <View key={line.id} style={[styles.line, index > 0 && styles.lineDivider]}>
        <Text style={{ color: colors.text, fontWeight: '600' }}>{line.description}</Text>
        <Text style={styles.meta}>{line.quantity} × {formatMoney(line.unitPrice)} = <Text style={styles.lineAmount}>{formatMoney(line.amount)} ฿</Text></Text>
      </View>)}
    </Card> : <Card><EmptyState compact>ไม่มีรายการในใบแจ้งหนี้</EmptyState></Card>}
    <InlineError message={actionError || undefined} />
    {data.status === 'DRAFT' && <Button title="บันทึกว่าวางบิลแล้ว" disabled={disabled || data.totalAmount <= 0 || !data.lineItems.length} busy={issue.isPending}
      onPress={() => Alert.alert('ยืนยันว่าได้วางบิลแล้ว', `${data.invoiceNumber} · ${data.customerName ?? 'ยังไม่ระบุผู้จ่าย'} · ${formatMoney(data.totalAmount)} ฿\nครบกำหนด ${data.dueAt ? thDate(data.dueAt) : thDate(new Date(Date.now() + 30 * 86400000))}\nบันทึกสถานะการวางบิล ไม่มีการส่งข้อความให้ลูกค้า`, [
        { text: 'ยกเลิก', style: 'cancel' }, { text: 'บันทึกวางบิล', onPress: () => { startAction(); issue.mutate(); } },
      ])} />}
    {sent && <>
      {/* One form at a time: the payment form is the primary path, follow-up is the quiet one. */}
      {!payment && !tracking && <Button title="บันทึกรับเงินจริง" disabled={disabled} onPress={() => { startAction(); setTriedPay(false);
        setPayment({ amount: String(data.outstanding), receivedAt: today, method: 'TRANSFER', note: '', createRequestId: requestId() }); }} />}
      {payment && <FormSection title="รับเงินตามหลักฐานการชำระ">
        <TextField label="จำนวนเงินที่รับจริง (บาท)" required value={payment.amount} disabled={busy} onChange={amount => patchPayment({ amount })}
          placeholder="เช่น 1000.00" keyboardType="decimal-pad" hint={`ยอดค้าง ${formatMoney(data.outstanding)} ฿`} error={triedPay ? payErrors.amount : undefined}
          inputStyle={styles.amountInput} />
        {busy ? <Text>{thDate(payment.receivedAt)}</Text> : <DatePicker label="วันที่รับเงินจริง" required value={payment.receivedAt} maxDate={today}
          error={triedPay ? payErrors.receivedAt : undefined} onChange={receivedAt => patchPayment({ receivedAt })} />}
        <Dropdown label="ช่องทางรับเงิน" fieldLabel="ช่องทางรับเงิน" inline value={payment.method} disabled={busy}
          options={Object.entries(PAYMENT_METHOD_LABEL).map(([value, label]) => ({ value, label }))} onChange={method => patchPayment({ method: method as Payment['method'] })} />
        <TextField label="เลขอ้างอิง / หมายเหตุการรับเงิน · ถ้ามี" value={payment.note} disabled={busy} onChange={note => patchPayment({ note })} />
        <MissingSummary items={payMissing} />
        <Button title="ตรวจและยืนยันรับเงิน" disabled={disabled} busy={receive.isPending} onPress={() => {
          setTriedPay(true);
          if (payErrors.amount || payErrors.receivedAt) return;
          Alert.alert('ยืนยันรับเงินจริง', `${data.invoiceNumber} · ${formatMoney(amount)} ฿\n${thDate(payment.receivedAt)} · ${PAYMENT_METHOD_LABEL[payment.method]}\nยืนยันตามหลักฐานการชำระที่ตรวจแล้ว`, [{ text: 'ยกเลิก', style: 'cancel' }, { text: 'บันทึกรับเงิน', onPress: () => { startAction(); receive.mutate(payment); } }]);
        }} />
        <Button title="ยกเลิกร่างรับเงิน" variant="link" disabled={busy} onPress={() => { setPayment(null); setTriedPay(false); }} />
      </FormSection>}
      <SectionLabel>ผู้ติดตามและปัญหาค้าง</SectionLabel>
      {!tracking && <Card style={{ gap: spacing.xs }}>
        <Text style={{ color: colors.ink, fontWeight: '600' }}>ผู้ติดตาม {data.collectionOwner ? `${data.collectionOwner.firstName} ${data.collectionOwner.lastName}` : '— ยังไม่ระบุ'}</Text>
        <Text style={styles.meta}>นัดติดตาม {data.collectionNextAt ? thDate(data.collectionNextAt) : '— ยังไม่ระบุ'}</Text>
        <Text style={styles.meta}>{data.collectionNote ?? 'ยังไม่มีบันทึกผลติดตาม / ปัญหา'}</Text>
        {!payment && <Button title="แก้ผู้ติดตาม / วันนัด / ปัญหา" variant="link" disabled={disabled}
          onPress={() => { startAction(); setTracking({ ownerId: data.collectionOwner?.id ?? user!.id, nextAt: data.collectionNextAt ?? today, note: data.collectionNote ?? '', updatedAt: data.updatedAt }); }} />}
      </Card>}
      {tracking && <FormSection title="บันทึกการติดตาม">
        {members.isError && <InlineError message="โหลดรายชื่อผู้ติดตามไม่ได้" onRetry={() => members.refetch()} />}
        <Dropdown label="ผู้รับผิดชอบติดตาม" fieldLabel="ผู้รับผิดชอบติดตาม" value={tracking.ownerId} disabled={busy || members.isLoading}
          placeholder={members.isLoading ? 'กำลังโหลดรายชื่อ…' : undefined} onChange={ownerId => setTracking({ ...tracking, ownerId })}
          options={[{ value: '', label: 'ยังไม่ระบุผู้ติดตาม' }, ...(members.data ?? []).map(member => ({ value: member.id, label: `${member.firstName} ${member.lastName}` }))]} />
        {busy ? <Text>{tracking.nextAt ? thDate(tracking.nextAt) : 'ยังไม่ระบุ'}</Text> : <DatePicker label="วันติดตามถัดไป · ถ้ามี" value={tracking.nextAt}
          placeholder="ไม่กำหนด" onChange={nextAt => setTracking({ ...tracking, nextAt })} onClear={() => setTracking({ ...tracking, nextAt: '' })} />}
        <TextArea label="ผลติดตาม / ปัญหาที่ยังค้าง · ถ้ามี" value={tracking.note} disabled={busy} onChange={note => setTracking({ ...tracking, note })} />
        {tracking.updatedAt !== data.updatedAt && <><InlineError message="ข้อมูลใบนี้เปลี่ยนแล้ว ตรวจสถานะล่าสุดก่อนบันทึกร่างนี้" />
          <Button title="ใช้สถานะล่าสุดและคงข้อความร่าง" variant="secondary" disabled={disabled} onPress={() => setTracking({ ...tracking, updatedAt: data.updatedAt })} /></>}
        <Button title="บันทึกการติดตาม" disabled={disabled || tracking.updatedAt !== data.updatedAt} busy={saveTracking.isPending} onPress={() => { startAction(); saveTracking.mutate(tracking); }} />
        <Button title="ยกเลิกร่างการติดตาม" variant="link" disabled={busy} onPress={() => setTracking(null)} />
      </FormSection>}
    </>}
    {(tracking || payment) && <View style={{ gap: spacing.sm }}>{draft.message ? <Text style={{ color: colors.muted, fontSize: 13 }}>{draft.message}</Text> : null}
      {draft.error ? <InlineError message={draft.error} onRetry={draft.retry} /> : null}</View>}
    {(tracking || payment) && !sent && <Card style={{ gap: spacing.sm }}><Text style={{ color: colors.text }}>ใบนี้ไม่อยู่ในสถานะรอติดตามแล้ว ร่างยังเก็บไว้ให้ตรวจเทียบกับประวัติรับเงิน</Text>
      <Button title="ล้างร่างที่ไม่ต้องใช้แล้ว" variant="secondary" onPress={() => { setTracking(null); setPayment(null); }} /></Card>}
    <SectionLabel>ประวัติรับเงินจริง · ทุกเดือน</SectionLabel>
    {data.payments.length ? <Card style={{ paddingVertical: spacing.xs }}>
      {data.payments.map((row, index) => <View key={row.id} style={[styles.line, index > 0 && styles.lineDivider]}>
        <Text style={{ color: colors.ink }}><Text style={styles.lineAmount}>{formatMoney(row.amount)} ฿</Text> · {thDate(row.receivedAt)}</Text>
        <Text style={styles.meta}>{PAYMENT_METHOD_LABEL[row.method]}{row.note ? ` · ${row.note}` : ''}</Text>
      </View>)}
    </Card> : <Card><EmptyState compact>ยังไม่มีรายการรับเงินจริงสำหรับใบนี้</EmptyState></Card>}
  </FormPage>;
}

const styles = StyleSheet.create({
  statePage: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg },
  notice: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.goodSoft,
    borderLeftWidth: 3, borderLeftColor: colors.good },
  payer: { ...typeScale.title, color: colors.ink },
  meta: { color: colors.muted, fontSize: 14, lineHeight: 22 },
  overline: { ...typeScale.overline, color: colors.muted, marginTop: spacing.xs },
  big: { ...typeScale.stat, color: colors.ink, fontVariant: ['tabular-nums'] },
  due: { paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider },
  line: { gap: 2, paddingVertical: spacing.md },
  lineDivider: { borderTopWidth: 1, borderTopColor: colors.divider },
  lineAmount: { color: colors.ink, fontFamily: fonts.bold, fontVariant: ['tabular-nums'] },
  amountInput: { fontSize: 22, fontFamily: fonts.semibold, fontVariant: ['tabular-nums'] },
});
