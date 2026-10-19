import React, { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { PARTICIPANT_ROLE_LABELS, PARTICIPANT_SIDE_LABELS, ParticipantRole, ParticipantSide, opponentParticipantRole } from '@lawfirm/shared';
import { api } from '@/api/client';
import { useCase } from '@/api/hooks';
import { SelectField, TextField } from '@/components/Input';
import { FormPage, FormSection } from '@/components/Form';
import { Button, ErrorState, InlineError, LoadingState } from '@/components/ui';
import { colors, spacing } from '@/theme';

export default function CasePartyScreen() {
  const { id, participantId } = useLocalSearchParams<{ id: string; participantId?: string }>();
  const router = useRouter();
  const cache = useQueryClient();
  const legalCase = useCase(id);
  const existing = legalCase.data?.participants?.find((p) => p.id === participantId);
  // The row that stands for the case's own client: the API refuses to delete it or move it off our side.
  const isCaseClient = !!existing?.clientId && existing.clientId === legalCase.data?.client?.id;
  const [name, setName] = useState('');
  const [side, setSide] = useState<string>(ParticipantSide.OPPONENT);
  const [role, setRole] = useState<string>(ParticipantRole.OTHER);
  const [personType, setPersonType] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [triedSave, setTriedSave] = useState(false);

  useEffect(() => {
    if (existing) {
      setName(existing.name); setSide(existing.side); setRole(existing.role);
      setPersonType(existing.personType ?? ''); setPhone(existing.phone ?? '');
    } else if (legalCase.data) {
      setRole(opponentParticipantRole(legalCase.data.partyRole ?? null));
    }
  }, [existing?.id, legalCase.data?.id]);

  if (legalCase.isLoading) return <View style={{ flex: 1, backgroundColor: colors.bg }}><LoadingState /></View>;
  if (!legalCase.data) return <FormPage><ErrorState message="โหลดคดีไม่สำเร็จ" onRetry={() => legalCase.refetch()} /></FormPage>;

  const done = async () => {
    await cache.invalidateQueries({ queryKey: ['case', id] });
    router.back();
  };

  const save = async () => {
    setTriedSave(true);
    if (!name.trim()) return;
    setBusy(true); setError('');
    try {
      const body = { name: name.trim(), ...(isCaseClient ? {} : { side }), role, personType: personType || null, phone: phone.trim() || null };
      await api(existing ? `/cases/${id}/participants/${existing.id}` : `/cases/${id}/participants`, { method: existing ? 'PATCH' : 'POST', body });
      await done();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
    } finally { setBusy(false); }
  };

  const remove = () => Alert.alert('ลบคู่ความ', `ลบ "${existing?.name}"?`, [
    { text: 'ยกเลิก', style: 'cancel' },
    { text: 'ลบ', style: 'destructive', onPress: async () => {
      setBusy(true);
      try { await api(`/cases/${id}/participants/${existing!.id}`, { method: 'DELETE' }); await done(); }
      catch (e) { setError(e instanceof Error ? e.message : 'ลบไม่สำเร็จ'); setBusy(false); }
    } },
  ]);

  return <FormPage>
    <Stack.Screen options={{ title: existing ? 'แก้ไขคู่ความ' : 'เพิ่มคู่ความ' }} />
    <FormSection title={legalCase.data.ownRef} detail={legalCase.data.title}>
      <TextField label="ชื่อคู่ความ" required value={name} onChange={setName} disabled={busy}
        error={triedSave && !name.trim() ? 'ใส่ชื่อคู่ความ' : undefined} />
      <SelectField label="ฝ่าย" value={side} onChange={setSide} disabled={busy || isCaseClient}
        hint={isCaseClient ? 'ลูกความหลักของคดี ย้ายฝ่ายหรือลบไม่ได้ · เปลี่ยนลูกความได้ที่หน้าแก้ไขคดี' : undefined}
        options={Object.values(ParticipantSide).map((s) => ({ value: s, label: PARTICIPANT_SIDE_LABELS[s] }))} />
      <SelectField label="ฐานะในคดี" value={role} onChange={setRole} disabled={busy}
        options={Object.values(ParticipantRole).map((r) => ({ value: r, label: PARTICIPANT_ROLE_LABELS[r] }))} />
      <SelectField label="ประเภทบุคคล · ถ้ามี" sheetTitle="ประเภทบุคคล" value={personType} onChange={setPersonType} disabled={busy} inline
        options={[{ value: '', label: 'ยังไม่ระบุ' }, { value: 'บุคคลธรรมดา', label: 'บุคคลธรรมดา' }, { value: 'นิติบุคคล', label: 'นิติบุคคล' }]} />
      <TextField label="โทรศัพท์ · ถ้ามี" value={phone} onChange={setPhone} disabled={busy} keyboardType="phone-pad" textContentType="telephoneNumber" autoComplete="tel" />
    </FormSection>
    <InlineError message={error || undefined} />
    <Button title="บันทึก" busy={busy} onPress={save} />
    {existing && !isCaseClient && <View style={{ marginTop: spacing.xl }}>
      <Button title="ลบคู่ความ" variant="danger" disabled={busy} onPress={remove} />
    </View>}
  </FormPage>;
}
