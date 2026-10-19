import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, View } from 'react-native';
import { Text, TextInput } from '@/components/AppText';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, X } from 'lucide-react-native';
import { api, ApiError } from '@/api/client';
import type { EmailComposeOptions, EmailTemplateItem, EmailThreadDetail } from '@/api/types';
import { Dropdown } from '@/components/Dropdown';
import { FieldError, FieldLabel, FormField, FormPage, FormSection, SwitchRow, fieldA11yLabel } from '@/components/Form';
import { Button, EmptyNote, ErrorNote, Loading } from '@/components/ui';
import { composeError, mergeTemplateBody, newSubject, parseAddressList, replyRecipients, replySubject } from '@/lib/case-email-compose';
import { colors, fonts, radius, spacing } from '@/theme';

interface DocItem { id: string; filename?: string; name?: string; fileName?: string }
const docName = (d: DocItem) => d.filename ?? d.name ?? d.fileName ?? 'เอกสาร';

function uuidV4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Recipient chips plus a free-text input. Suggestions show only under the field the user is filling. */
function AddressField({ label, items, onChange, suggestions, required = false, error, showSuggestions, onFocus }: {
  label: string; items: string[]; onChange: (items: string[]) => void; suggestions: EmailComposeOptions['recipients'];
  required?: boolean; error?: string; showSuggestions: boolean; onFocus: () => void;
}) {
  const [text, setText] = useState('');
  const add = (raw: string) => {
    const merged = [...items];
    for (const a of parseAddressList(raw)) if (!merged.some((x) => x.toLowerCase() === a.toLowerCase())) merged.push(a);
    onChange(merged);
    setText('');
  };
  const free = suggestions.filter((s) => !items.some((x) => x.toLowerCase() === s.email.toLowerCase()));
  return <View style={{ gap: spacing.sm }}>
    <FieldLabel required={required}>{label}</FieldLabel>
    {items.length > 0 && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
      {items.map((a) => <Pressable key={a} accessibilityRole="button" accessibilityLabel={`ลบ ${a}`} onPress={() => onChange(items.filter((x) => x !== a))}
        style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.md, borderRadius: radius.button, backgroundColor: colors.soft }}>
        <Text style={{ color: colors.ink, fontSize: 14 }}>{a}</Text><X size={14} color={colors.muted} />
      </Pressable>)}
    </View>}
    <TextInput accessibilityLabel={fieldA11yLabel(label, required)} accessibilityHint={error || undefined} value={text}
      onChangeText={(v) => (/[,;\s]$/.test(v) ? add(v) : setText(v))} onFocus={onFocus}
      onSubmitEditing={() => add(text)} onBlur={() => add(text)} autoCapitalize="none" autoCorrect={false} keyboardType="email-address"
      placeholder="พิมพ์อีเมล แล้วเว้นวรรคหรือกด Enter" placeholderTextColor={colors.faint}
      style={{ minHeight: 48, padding: spacing.md, borderWidth: 1, borderColor: error ? colors.warn : colors.line, borderRadius: radius.button, backgroundColor: colors.surface, color: colors.text, fontSize: 16 }} />
    <FieldError message={error} />
    {showSuggestions && free.length > 0 && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
      {free.slice(0, 12).map((s) => <Pressable key={s.email} accessibilityRole="button" accessibilityLabel={`เพิ่ม ${s.name} ${s.email}`} onPress={() => add(s.email)}
        style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: radius.button, borderWidth: 1, borderColor: colors.line }}>
        <Text style={{ color: colors.info, fontSize: 13 }}>+ {s.name || s.email}</Text>
      </Pressable>)}
    </View>}
  </View>;
}

function DocPicker({ caseId, selected, onChange }: { caseId: string; selected: string[]; onChange: (ids: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const docs = useQuery({ queryKey: ['case-documents', caseId], queryFn: () => api<DocItem[]>(`/cases/${caseId}/documents`), enabled: open || selected.length > 0 });
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : selected.length >= 10 ? selected : [...selected, id]);
  return <>
    <Button title={selected.length ? `แนบเอกสารคดี · เลือกแล้ว ${selected.length} ไฟล์` : 'แนบเอกสารคดี'} variant="secondary" onPress={() => setOpen(true)} />
    <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
      <SafeAreaProvider><SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={{ padding: spacing.lg, gap: spacing.xs }}>
          <Text accessibilityRole="header" style={{ fontSize: 20, fontFamily: fonts.bold, color: colors.ink }}>แนบเอกสารคดี</Text>
          <Text style={{ color: colors.muted, fontSize: 13 }}>เลือกได้ไม่เกิน 10 ไฟล์ · ไฟล์ใหญ่กว่า 3 MB จะส่งเป็นลิงก์ OneDrive</Text>
        </View>
        <ScrollView>
          {docs.isLoading ? <Loading label="กำลังโหลดเอกสาร…" /> : docs.isError ? <View style={{ padding: spacing.lg }}><ErrorNote message="โหลดเอกสารไม่สำเร็จ" onRetry={() => docs.refetch()} /></View>
            : (docs.data?.length ?? 0) === 0 ? <EmptyNote>คดีนี้ยังไม่มีเอกสาร</EmptyNote>
            : docs.data!.map((d) => {
              const on = selected.includes(d.id);
              return <Pressable key={d.id} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => toggle(d.id)}
                style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderBottomWidth: 1, borderColor: colors.line }}>
                <View style={{ width: 24, height: 24, borderRadius: 6, borderWidth: 1.5, borderColor: on ? colors.good : colors.muted, backgroundColor: on ? colors.good : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                  {on && <Check size={15} color={colors.surface} strokeWidth={3} />}
                </View>
                <Text style={{ flex: 1, color: colors.text }} numberOfLines={2}>{docName(d)}</Text>
              </Pressable>;
            })}
        </ScrollView>
        <View style={{ padding: spacing.lg }}><Button title="เสร็จ" onPress={() => setOpen(false)} /></View>
      </SafeAreaView></SafeAreaProvider>
    </Modal>
  </>;
}

export default function EmailComposeScreen() {
  const { id, threadId, replyTo, replyAll } = useLocalSearchParams<{ id: string; threadId?: string; replyTo?: string; replyAll?: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const isReply = !!replyTo && !!threadId;
  const [to, setTo] = useState<string[]>([]);
  const [cc, setCc] = useState<string[]>([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [docIds, setDocIds] = useState<string[]>([]);
  const [signature, setSignature] = useState(true);
  const [review, setReview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [triedReview, setTriedReview] = useState(false);
  const [showCc, setShowCc] = useState(false);
  const [activeAddress, setActiveAddress] = useState<'to' | 'cc'>('to');
  const requestId = useRef(uuidV4());
  const sent = useRef(false);
  const prefilled = useRef(false);

  const options = useQuery({ queryKey: ['email-compose-options', id], queryFn: () => api<EmailComposeOptions>(`/cases/${id}/outbound-email/compose-options`), enabled: !!id });
  const templates = useQuery({ queryKey: ['email-templates'], queryFn: () => api<EmailTemplateItem[]>('/email-templates') });
  const source = useQuery({ queryKey: ['case-email-thread', id, threadId], queryFn: () => api<EmailThreadDetail>(`/cases/${id}/email/threads/${threadId}`), enabled: isReply });

  useEffect(() => {
    if (prefilled.current || !options.data || (isReply && !source.data)) return;
    prefilled.current = true;
    const msg = source.data?.messages.find((m) => m.id === replyTo);
    if (isReply && msg && source.data) {
      const r = replyRecipients(msg, replyAll === '1', options.data.mailboxAddress);
      setTo(r.to); setCc(r.cc); setSubject(replySubject(source.data.subject));
    } else setSubject(newSubject(options.data.ownRef));
  }, [options.data, source.data, isReply, replyTo, replyAll]);

  const dirty = body.trim().length > 0 || docIds.length > 0;
  useEffect(() => navigation.addListener('beforeRemove', (e) => {
    if (sent.current || !dirty) return;
    e.preventDefault();
    Alert.alert('ทิ้งข้อความที่เขียน?', undefined, [
      { text: 'เขียนต่อ', style: 'cancel' },
      { text: 'ทิ้ง', style: 'destructive', onPress: () => navigation.dispatch(e.data.action) },
    ]);
  }), [navigation, dirty]);

  const applyTemplate = async (tid: string) => {
    setTemplateId(tid);
    try {
      const r = await api<{ subject: string; body: string; missing: Array<{ key: string; label: string }> }>(`/cases/${id}/email-templates/${tid}/render`);
      const fill = (how: 'replace' | 'append') => { setBody(mergeTemplateBody(body, r.body, how)); if (!isReply) setSubject(r.subject); setMissing(r.missing.map((m) => m.label)); };
      if (body.trim()) Alert.alert('มีข้อความอยู่แล้ว', undefined, [
        { text: 'ยกเลิก', style: 'cancel' }, { text: 'ต่อท้าย', onPress: () => fill('append') }, { text: 'แทนที่', onPress: () => fill('replace') }]);
      else fill('replace');
    } catch (e) { setError(e instanceof Error ? e.message : 'ใช้แม่แบบไม่สำเร็จ'); }
  };

  const send = useMutation({
    mutationFn: () => api<{ mode: string; recorded: boolean; linkedFiles: Array<{ filename: string }> }>(`/cases/${id}/outbound-email/send`, {
      method: 'POST',
      body: { to, cc, subject, body, ...(docIds.length ? { documentIds: docIds } : {}), ...(isReply ? { replyToMessageId: replyTo, replyAll: replyAll === '1' } : {}),
        clientRequestId: requestId.current, includeSignature: signature && !!options.data?.signature },
    }),
    onSuccess: (r) => {
      sent.current = true;
      queryClient.invalidateQueries({ queryKey: ['case-email-threads', id] });
      queryClient.invalidateQueries({ queryKey: ['case-email-thread', id] });
      const notes = [r.mode === 'REPLY_AS_NEW' ? 'ส่งเป็นอีเมลใหม่ (ไม่สามารถตอบในเธรดเดิมได้)' : null,
        r.linkedFiles.length ? `ส่งเป็นลิงก์ OneDrive: ${r.linkedFiles.map((f) => f.filename).join(', ')}` : null].filter(Boolean).join('\n');
      Alert.alert('ส่งอีเมลแล้ว', notes || undefined);
      router.back();
    },
    onError: (e) => setError(e instanceof ApiError || e instanceof Error ? e.message : 'ส่งอีเมลไม่สำเร็จ'),
  });

  const problem = useMemo(() => composeError({ to, cc, subject, body }), [to, cc, subject, body]);
  // composeError reports one problem at a time; show it under the field it belongs to.
  const problemField = !problem ? null
    : problem.startsWith('อีเมลไม่ถูกต้อง') ? (to.some((a) => problem.includes(a)) ? 'to' : 'cc')
    : problem.includes('{{') ? (subject.includes('{{') ? 'subject' : 'body')
    : problem.includes('หัวเรื่อง') ? 'subject'
    : problem.includes('เนื้อหา') ? 'body'
    : 'to';
  const errorFor = (field: 'to' | 'cc' | 'subject' | 'body') => (triedReview && problemField === field ? problem ?? undefined : undefined);
  const hasTemplates = (templates.data?.length ?? 0) > 0;
  const pickedDocs = useQuery({ queryKey: ['case-documents', id], queryFn: () => api<DocItem[]>(`/cases/${id}/documents`), enabled: !!id && docIds.length > 0 });

  const failure = (message: string, retry: () => void) => <View style={{ flex: 1, padding: spacing.lg, backgroundColor: colors.bg }}><ErrorNote message={message} onRetry={retry} /></View>;
  if (options.isLoading || (isReply && source.isLoading)) return <Loading label="กำลังเตรียมอีเมล…" />;
  if (options.isError || !options.data) return failure('โหลดข้อมูลเขียนอีเมลไม่สำเร็จ', () => options.refetch());
  if (isReply && source.isError) return failure('โหลดอีเมลต้นฉบับไม่สำเร็จ', () => source.refetch());
  if (!options.data.mailboxAddress) return <View style={{ flex: 1, padding: spacing.lg, gap: spacing.md, backgroundColor: colors.bg }}>
    <Text style={{ color: colors.text, lineHeight: 22 }}>ยังไม่ได้เชื่อม Microsoft 365 · ให้ผู้ดูแลเชื่อมที่หน้าเว็บ &gt; ตั้งค่า</Text>
    <Button title="กลับ" variant="secondary" onPress={() => router.back()} />
  </View>;
  const opts = options.data;
  const pickedNames = docIds.map((docId) => {
    const doc = pickedDocs.data?.find((d) => d.id === docId);
    return doc ? docName(doc) : 'เอกสาร';
  });

  if (review) return <>
    <Stack.Screen options={{ title: 'ตรวจทานก่อนส่ง' }} />
    <FormPage>
      <FormSection title="ตรวจทานก่อนส่ง">
        <Text>จาก: {opts.mailboxAddress}</Text>
        <Text>ถึง: {to.join(', ')}</Text>
        {cc.length > 0 && <Text>สำเนา: {cc.join(', ')}</Text>}
        <Text style={{ fontWeight: '700' }}>{subject}</Text>
        {docIds.length > 0
          ? <Text style={{ color: colors.muted }}>ไฟล์แนบ: {pickedNames.join(', ')}</Text>
          : <Text style={{ color: colors.muted }}>ไม่มีไฟล์แนบ</Text>}
        <Text style={{ color: colors.muted }}>ลายเซ็น: {signature && opts.signature ? 'มี' : 'ไม่มี'}</Text>
        <Text style={{ lineHeight: 22 }}>{body}</Text>
      </FormSection>
      {error && <ErrorNote message={error} />}
      <Button title="ส่งอีเมล" busy={send.isPending} disabled={send.isPending} onPress={() => { setError(null); send.mutate(); }} />
      <Button title="กลับไปแก้ไข" variant="secondary" disabled={send.isPending} onPress={() => setReview(false)} />
    </FormPage>
  </>;

  return <>
    <Stack.Screen options={{ title: isReply ? 'ตอบกลับอีเมล' : 'เขียนอีเมล' }} />
    <FormPage>
      <AddressField label="ถึง" required items={to} onChange={setTo} suggestions={opts.recipients} error={errorFor('to')}
        showSuggestions={activeAddress === 'to'} onFocus={() => setActiveAddress('to')} />
      {showCc || cc.length > 0
        ? <AddressField label="สำเนา (CC)" items={cc} onChange={setCc} suggestions={opts.recipients} error={errorFor('cc')}
            showSuggestions={activeAddress === 'cc'} onFocus={() => setActiveAddress('cc')} />
        : <Button title="+ สำเนา (CC)" variant="link" onPress={() => { setShowCc(true); setActiveAddress('cc'); }} />}
      {hasTemplates && <View style={{ gap: spacing.sm }}>
        <Dropdown label="เลือกแม่แบบ" fieldLabel="แม่แบบอีเมล · ถ้ามี" hint={isReply ? undefined : 'ใช้แม่แบบจะแทนหัวเรื่องด้านล่าง'}
          value={templateId} options={templates.data!.map((t) => ({ value: t.id, label: t.name }))} onChange={applyTemplate} />
        {missing.length > 0 && <Text style={{ color: colors.warn, fontSize: 13 }}>ยังไม่มีข้อมูล: {missing.join(', ')} — กรอกเองในข้อความ</Text>}
      </View>}
      <FormField label="หัวเรื่อง" required value={subject} onChange={setSubject} error={errorFor('subject')} />
      <FormField label="ข้อความ" required value={body} onChange={setBody} multiline error={errorFor('body')} />
      <DocPicker caseId={id} selected={docIds} onChange={setDocIds} />
      {opts.signature ? <View style={{ gap: spacing.xs }}>
        <SwitchRow label="แนบลายเซ็น" value={signature} onValueChange={setSignature} />
        {signature && <Text style={{ color: colors.muted, fontSize: 13 }}>{opts.signature}</Text>}
      </View> : null}
      {error && <ErrorNote message={error} />}
      <Button title="ตรวจทานก่อนส่ง" onPress={() => {
        setTriedReview(true);
        if (problem) return;
        setError(null); setReview(true);
      }} />
    </FormPage>
  </>;
}
