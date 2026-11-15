import React, { useCallback, useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { hasFirmCapability, suggestWht } from '@lawfirm/shared';
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
type Payment = { amount: string; receivedAt: string; method: InvoicePaymentItem['method'] | 'PROMPTPAY'; note: string; createRequestId: string; whtEnabled?: boolean; whtRate?: '0.03' | '0.01'; whtAmount?: string; certificate?: string };
type Receipt = { id: string; invoiceId: string; receiptNumber: string; issuedAt: string; amount: number; whtAmount?: number; voidedAt: string | null };
type PaymentResult = { receipt: { receiptNumber: string } | null };
const methods = { TRANSFER: 'โอน', PROMPTPAY: 'พร้อมเพย์', CHEQUE: 'เช็ค', CASH: 'เงินสด' } as const;
const requestId = () => `mobile-payment-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;

export default function InvoiceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(), { user } = useAuth(), router = useRouter(), client = useQueryClient();
  const owner = hasFirmCapability(user?.firmRole, 'manageInvoices'), today = bangkokDay(new Date().toISOString());
  const invoice = useQuery({ queryKey: ['collection-invoice', id], enabled: owner && !!id, queryFn: () => api<CollectionDetail>(`/invoices/${id}/collection`) });
  const members = useMembers();
  const receipts = useQuery({ queryKey: ['invoice-receipts', id], enabled: owner && !!id, queryFn: () => api<Receipt[]>('/receipts').then(rows => rows.filter(row => row.invoiceId === id)) });
  useFocusEffect(useCallback(() => { if (owner) void invoice.refetch(); }, [owner, invoice.refetch]));
  const [tracking, setTracking] = useState<Tracking | null>(null), [payment, setPayment] = useState<Payment | null>(null);
  const [triedPay, setTriedPay] = useState(false);
  // Results show in place; a dialog is kept only for the confirmations that record money or status.
  const [notice, setNotice] = useState(''), [actionError, setActionError] = useState('');
  const draft = useTaskDraft(user && owner ? `${taskDraftScope(user)}invoice:${id}` : null, { tracking, payment, files: [] }, value => { setTracking(value.tracking); setPayment(value.payment); }, !!tracking || !!payment,
    { name: `ร่างติดตาม / รับเงิน ${invoice.data?.invoiceNumber ?? ''}`, route: `/invoice/${id}` });
  const refreshMoney = () => { for (const key of ['owner-finance', 'owner-kpis', 'collection-invoice', 'invoice-receipts']) void client.invalidateQueries({ queryKey: [key] }); };
  const saveTracking = useMutation({ retry: false,
    mutationFn: (value: Tracking) => api<CollectionDetail>(`/invoices/${id}/follow-up`, { method: 'PATCH', body: { ...value, ownerId: value.ownerId || null, nextAt: value.nextAt || null, note: value.note.trim() || null } }),
    onSuccess: () => { setTracking(null); refreshMoney(); setNotice('บันทึกการติดตามแล้ว'); },
    onError: error => { void invoice.refetch(); setActionError(`บันทึกการติดตามไม่สำเร็จ · ${error.message}`); },
  });
  const receive = useMutation({ retry: false,
    mutationFn: (value: Payment) => api<PaymentResult>(`/invoices/${id}/payments`, { method: 'POST', body: { amount: Number(value.amount), receivedAt: value.receivedAt, method: value.method === 'PROMPTPAY' ? 'TRANSFER' : value.method, note: value.method === 'PROMPTPAY' ? ['พร้อมเพย์', value.note.trim()].filter(Boolean).join(' · ') : value.note.trim() || undefined, createRequestId: value.createRequestId, whtAmount: value.whtEnabled ? Number(value.whtAmount) : 0, whtRate: value.whtEnabled ? Number(value.whtRate) : null, whtCertificateNo: value.whtEnabled ? value.certificate?.trim() || undefined : undefined } }),
    onSuccess: result => { setPayment(null); setTriedPay(false); refreshMoney(); setNotice(result.receipt ? `ออกใบเสร็จ ${result.receipt.receiptNumber} แล้ว` : 'เช็ครอเคลียร์'); },
    onError: async (error, value) => {
      const fresh = await invoice.refetch();
      if (fresh.data?.payments.some(row => row.createRequestId === value.createRequestId)) {
        setPayment(null); setTriedPay(false); refreshMoney(); setNotice('ตรวจพบรายการรับเงินที่บันทึกแล้ว · ไม่ได้สร้างรายการซ้ำ');
      } else setActionError(`ยังยืนยันผลรับเงินไม่ได้ · ${error.message} · ตรวจประวัติรับเงินก่อนลองอีกครั้ง ร่างเดิมใช้คีย์เดิมเพื่อกันซ้ำ`);
    },
  });
  const clearCheque = useMutation({ retry: false, mutationFn: (paymentId: string) => api<PaymentResult>(`/invoices/${id}/payments/${paymentId}/clear`, { method: 'POST', body: { clearedAt: today } }),
    onSuccess: result => { refreshMoney(); setNotice(result.receipt ? `ออกใบเสร็จ ${result.receipt.receiptNumber} แล้ว` : 'ยืนยันเช็คผ่านแล้ว'); },
    onError: error => { refreshMoney(); setActionError(`ยืนยันเช็คไม่สำเร็จ · ${error.message} · ตรวจสถานะล่าสุดแล้วลองใหม่`); } });
  const issue = useMutation({ retry: false,
    mutationFn: () => api(`/invoices/${id}/send`, { method: 'PATCH' }),
    onSuccess: () => { refreshMoney(); setNotice('บันทึกวางบิลแล้ว'); },
    onError: error => { void invoice.refetch(); setActionError(`บันทึกวางบิลไม่สำเร็จ · ${error.message} · ตรวจสถานะล่าสุดก่อนทำอีกครั้ง`); },
  });
  if (!owner) return <View style={styles.statePage}><EmptyState>ข้อมูลการเงินสำหรับเจ้าของและผู้จัดการสำนักงาน</EmptyState></View>;
  if (invoice.isLoading) return <LoadingState label="กำลังโหลดใบแจ้งหนี้…" />;
  const data = invoice.data;
  if (!data) return <FormPage><ErrorState message="โหลดใบแจ้งหนี้ไม่ได้" onRetry={() => invoice.refetch()} /></FormPage>;
  const busy = saveTracking.isPending || receive.isPending || issue.isPending || clearCheque.isPending;
  const disabled = busy || invoice.isError || invoice.isFetching || !draft.ready;
  const patchPayment = (patch: Partial<Payment>) => setPayment(value => value ? { ...value, ...patch, createRequestId: requestId() } : null);
  // Keep the gross settled (cash + WHT) fixed and split it again whenever WHT is switched or its rate changes, as the web form does.
  const feeBase = Math.max(0, data.lineItems.filter(line => line.taxClass !== 'DISBURSEMENT').reduce((sum, line) => sum + line.amount, 0) - (data.discountAmount ?? 0));
  const splitWht = (value: Payment, whtEnabled: boolean, whtRate: '0.03' | '0.01'): Partial<Payment> => {
    const gross = (Number(value.amount) || 0) + (value.whtEnabled ? Number(value.whtAmount) || 0 : 0);
    const wht = whtEnabled ? suggestWht(Number(whtRate), feeBase, gross, 0, data.outstanding, data.totalAmount) : 0;
    return { whtEnabled, whtRate, whtAmount: wht.toFixed(2), amount: String(Math.round((gross - wht) * 100) / 100) };
  };
  const startAction = () => { setNotice(''); setActionError(''); };
  const amount = payment ? Number(payment.amount) : 0;
  const withheld = payment?.whtEnabled ? Number(payment.whtAmount) : 0;
  const payErrors = payment ? {
    amount: !/^\d+(?:\.\d{1,2})?$/.test(payment.amount) || amount <= 0 ? 'ใส่ยอดรับมากกว่า 0 (ทศนิยมไม่เกิน 2 หลัก)'
      : amount + withheld > data.outstanding + 0.005 ? `ยอดรับรวมภาษีหัก ณ ที่จ่ายต้องไม่เกิน ${formatMoney(data.outstanding)} ฿` : undefined,
    wht: payment.whtEnabled && (!/^[0-9]+(?:\.[0-9]{1,2})?$/.test(payment.whtAmount ?? '') || withheld < 0) ? 'ใส่ยอดหักตามหนังสือรับรอง ทศนิยมไม่เกิน 2 หลัก' : undefined,
    receivedAt: payment.receivedAt > today ? 'วันที่รับเงินต้องไม่เกินวันนี้' : undefined,
  } : { amount: undefined, receivedAt: undefined, wht: undefined };
  const payMissing = triedPay ? [payErrors.amount && 'จำนวนเงินที่รับจริง', payErrors.receivedAt && 'วันที่รับเงินจริง', payErrors.wht && 'ยอดหัก ณ ที่จ่าย'].filter((item): item is string => !!item) : [];
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
      {!payment && !tracking && <Button title="บันทึกรับชำระ" accessibilityHint="เปิดแบบฟอร์มบันทึกการชำระ" disabled={disabled} onPress={() => { startAction(); setTriedPay(false);
        const base: Payment = { amount: String(data.outstanding), receivedAt: today, method: 'TRANSFER', note: '', createRequestId: requestId(), whtEnabled: false, whtRate: '0.03', whtAmount: '0', certificate: '' };
        setPayment(data.clientType === 'COMPANY' ? { ...base, ...splitWht(base, true, '0.03') } : base); }} />}
      <Modal visible={!!payment} transparent animationType="slide" onRequestClose={() => { if (!busy) setPayment(null); }}>
        <View style={styles.sheetBackdrop}><View style={styles.sheet}>
          <Text accessibilityRole="header" style={styles.sheetTitle}>บันทึกรับชำระ</Text>
          {payment && <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: spacing.md, paddingVertical: spacing.md }}>
            <Text style={styles.meta}>{data.invoiceNumber} · ยอดค้าง {formatMoney(data.outstanding)} ฿</Text>
            <Text style={{ fontWeight: '700' }}>ช่องทางรับเงิน</Text><Text style={styles.meta}>เลือกวิธีที่ได้รับเงินจริง</Text>
            <View style={styles.choices}>{Object.entries(methods).map(([value, label]) => <Button key={value} inline title={label} accessibilityHint={`เลือก${label}`} variant={payment.method === value ? 'primary' : 'secondary'} disabled={busy} onPress={() => patchPayment({ method: value as Payment['method'] })} />)}</View>
            {payment.method === 'CHEQUE' && <Text style={{ color: colors.warn }}>ยังไม่ออกใบเสร็จจนกว่าเช็คผ่าน</Text>}
            <DatePicker label="วันที่รับเงิน" hint="ใช้เป็นวันที่บนใบเสร็จ" required value={payment.receivedAt} maxDate={today} error={triedPay ? payErrors.receivedAt : undefined} onChange={receivedAt => patchPayment({ receivedAt })} />
            <TextField label="จำนวนเงินที่รับจริง (บาท)" required value={payment.amount} disabled={busy} onChange={amount => patchPayment({ amount })} placeholder="เช่น 1000.00" keyboardType="decimal-pad" hint="ยอดเงินที่ได้รับก่อนรวมภาษีหัก ณ ที่จ่าย" error={triedPay ? payErrors.amount : undefined} inputStyle={styles.amountInput} />
            <View style={styles.toggle}><View style={{ flex: 1 }}><Text style={{ fontWeight: '700' }}>ผู้ว่าจ้างหัก ณ ที่จ่าย</Text><Text style={styles.meta}>เปิดเมื่อมีหนังสือรับรอง</Text></View><Switch accessibilityLabel="ผู้ว่าจ้างหัก ณ ที่จ่าย" accessibilityHint="เปิดเพื่อระบุภาษีหัก ณ ที่จ่าย" value={!!payment.whtEnabled} disabled={busy} onValueChange={whtEnabled => patchPayment(splitWht(payment, whtEnabled, payment.whtRate ?? '0.03'))} /></View>
            {payment.whtEnabled && <><Text style={styles.meta}>เลือกอัตราตามหนังสือรับรอง</Text><View style={styles.choices}>{(['0.03', '0.01'] as const).map(rate => <Button key={rate} inline title={rate === '0.03' ? '3%' : '1%'} accessibilityHint="เลือกอัตราภาษี" variant={(payment.whtRate ?? '0.03') === rate ? 'primary' : 'secondary'} disabled={busy} onPress={() => patchPayment(splitWht(payment, true, rate))} />)}</View>
              <TextField label="ยอดหัก ณ ที่จ่าย (บาท)" value={payment.whtAmount ?? ''} disabled={busy} onChange={whtAmount => patchPayment({ whtAmount })} keyboardType="decimal-pad" hint="คำนวณจากอัตราให้แล้ว แก้ให้ตรงหนังสือรับรองได้" error={triedPay ? payErrors.wht : undefined} />
              <TextField label="เลขหนังสือรับรอง · ถ้ามี" value={payment.certificate ?? ''} disabled={busy} maxLength={120} onChange={certificate => patchPayment({ certificate })} hint="ใช้ตรวจสอบหนังสือรับรอง 50 ทวิ" /></>}
            <TextField label="เลขอ้างอิง / หมายเหตุ · ถ้ามี" value={payment.note} disabled={busy} onChange={note => patchPayment({ note })} hint="ระบุข้อมูลสำหรับตรวจสอบการชำระ" />
            <MissingSummary items={payMissing} />
            <InlineError message={actionError || undefined} />
          </ScrollView>}
          {payment && <View style={styles.sheetFooter}><Button title={payment.method === 'CHEQUE' ? 'บันทึกเช็ค' : 'บันทึกและออกใบเสร็จ'} accessibilityHint="ตรวจยอดและยืนยันการบันทึก" disabled={disabled} busy={receive.isPending} onPress={() => {
            setTriedPay(true); if (payErrors.amount || payErrors.receivedAt || payErrors.wht) return;
            Alert.alert('ยืนยันรับชำระ', `${data.invoiceNumber} · รับ ${formatMoney(amount)} ฿ · หัก ณ ที่จ่าย ${formatMoney(withheld)} ฿\n${thDate(payment.receivedAt)} · ${methods[payment.method as keyof typeof methods] ?? PAYMENT_METHOD_LABEL[payment.method as keyof typeof PAYMENT_METHOD_LABEL]}`, [{ text: 'ยกเลิก', style: 'cancel' }, { text: 'บันทึก', onPress: () => { startAction(); receive.mutate(payment); } }]);
          }} /><Button title="ยกเลิก" accessibilityHint="ปิดแบบฟอร์มโดยไม่บันทึก" variant="secondary" disabled={busy} onPress={() => { setPayment(null); setTriedPay(false); }} /></View>}
        </View></View>
      </Modal>
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
        {!!row.whtAmount && <Text style={styles.meta}>หัก ณ ที่จ่าย {formatMoney(row.whtAmount)} ฿ · รวม {formatMoney(row.amount + row.whtAmount)} ฿</Text>}
        <Text style={styles.meta}>{PAYMENT_METHOD_LABEL[row.method]}{row.note ? ` · ${row.note}` : ''}</Text>
        {row.method === 'CHEQUE' && !row.clearedAt && <><Tag tone="due">เช็ครอเคลียร์</Tag><Button title="ยืนยันเช็คผ่าน" accessibilityHint="บันทึกว่าเช็คผ่านวันนี้และออกใบเสร็จ" variant="secondary" disabled={disabled} onPress={() => Alert.alert('ยืนยันเช็คผ่าน', `บันทึกวันที่เช็คผ่าน ${thDate(today)} และออกใบเสร็จ`, [{ text: 'ยกเลิก', style: 'cancel' }, { text: 'ยืนยัน', onPress: () => { startAction(); clearCheque.mutate(row.id); } }])} /></>}
      </View>)}
    </Card> : <Card><EmptyState compact>ยังไม่มีรายการรับเงินจริงสำหรับใบนี้</EmptyState></Card>}
    <SectionLabel>ใบเสร็จของใบแจ้งหนี้นี้</SectionLabel>
    {receipts.isLoading && <LoadingState inline label="กำลังโหลดใบเสร็จ…" />}
    {receipts.isError && <InlineError message="โหลดใบเสร็จไม่ได้ ตรวจการเชื่อมต่อแล้วลองใหม่" onRetry={() => receipts.refetch()} />}
    {receipts.data && (receipts.data.length ? <Card style={{ paddingVertical: spacing.xs }}>{receipts.data.map((receipt, index) => <View key={receipt.id} style={[styles.line, index > 0 && styles.lineDivider]}><Text style={styles.lineAmount}>{receipt.receiptNumber}</Text><Text style={styles.meta}>{thDate(receipt.issuedAt)} · {formatMoney(receipt.amount + (receipt.whtAmount ?? 0))} ฿{receipt.whtAmount ? ` · หัก ณ ที่จ่าย ${formatMoney(receipt.whtAmount)} ฿` : ''}</Text>{receipt.voidedAt && <Tag tone="due">ยกเลิกแล้ว</Tag>}</View>)}</Card> : <Card><EmptyState compact>ยังไม่มีใบเสร็จสำหรับใบนี้</EmptyState></Card>)}
  </FormPage>;
}

const styles = StyleSheet.create({
  sheetBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: radius.md, borderTopRightRadius: radius.md, paddingHorizontal: 24, paddingTop: 20, maxHeight: '92%' },
  sheetTitle: { ...typeScale.title, color: colors.ink, paddingBottom: 12, borderBottomWidth: 1, borderColor: colors.divider },
  sheetFooter: { borderTopWidth: 1, borderColor: colors.divider, paddingVertical: 16, gap: 12 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 },
  statePage: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg },
  notice: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.goodSoft,
    borderWidth: 1, borderColor: colors.goodEdge },
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
