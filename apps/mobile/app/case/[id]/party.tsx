import React, { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { PARTICIPANT_ROLE_LABELS, PARTICIPANT_SIDE_LABELS, ParticipantRole, ParticipantSide, opponentParticipantRole } from '@lawfirm/shared';
import { api } from '@/api/client';
import { useCase } from '@/api/hooks';
import { Text } from '@/components/AppText';
import { Dropdown } from '@/components/Dropdown';
import { FormField, FormPage, FormSection } from '@/components/Form';
import { Button, ErrorNote, Loading } from '@/components/ui';
import { colors } from '@/theme';

export default function CasePartyScreen() {
  const { id, participantId } = useLocalSearchParams<{ id: string; participantId?: string }>();
  const router = useRouter();
  const cache = useQueryClient();
  const legalCase = useCase(id);
  const existing = legalCase.data?.participants?.find((p) => p.id === participantId);
  const [name, setName] = useState('');
  const [side, setSide] = useState<string>(ParticipantSide.OPPONENT);
  const [role, setRole] = useState<string>(ParticipantRole.OTHER);
  const [personType, setPersonType] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (existing) {
      setName(existing.name); setSide(existing.side); setRole(existing.role);
      setPersonType(existing.personType ?? ''); setPhone(existing.phone ?? '');
    } else if (legalCase.data) {
      setRole(opponentParticipantRole(legalCase.data.partyRole ?? null));
    }
  }, [existing?.id, legalCase.data?.id]);

  if (legalCase.isLoading) return <Loading />;
  if (!legalCase.data) return <FormPage><ErrorNote message="โหลดคดีไม่สำเร็จ" onRetry={() => legalCase.refetch()} /></FormPage>;

  const done = async () => {
    await cache.invalidateQueries({ queryKey: ['case', id] });
    router.back();
  };

  const save = async () => {
    if (!name.trim()) return Alert.alert('กรอกไม่ครบ', 'ใส่ชื่อคู่ความ');
    setBusy(true); setError('');
    try {
      const body = { name: name.trim(), side, role, personType: personType || null, phone: phone.trim() || null };
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
      <FormField label="ชื่อ" value={name} onChange={setName} disabled={busy} />
      <Dropdown label="ฝ่าย" value={side} onChange={setSide} disabled={busy}
        options={Object.values(ParticipantSide).map((s) => ({ value: s, label: PARTICIPANT_SIDE_LABELS[s] }))} />
      <Dropdown label="ฐานะในคดี" value={role} onChange={setRole} disabled={busy}
        options={Object.values(ParticipantRole).map((r) => ({ value: r, label: PARTICIPANT_ROLE_LABELS[r] }))} />
      <Dropdown label="ประเภทบุคคล" value={personType} onChange={setPersonType} disabled={busy}
        options={[{ value: '', label: 'ยังไม่ระบุ' }, { value: 'บุคคลธรรมดา', label: 'บุคคลธรรมดา' }, { value: 'นิติบุคคล', label: 'นิติบุคคล' }]} />
      <FormField label="โทรศัพท์" value={phone} onChange={setPhone} disabled={busy} />
    </FormSection>
    {!!error && <Text style={{ color: colors.warn }}>{error}</Text>}
    <Button title="บันทึก" busy={busy} onPress={save} />
    {existing && <Button title="ลบคู่ความ" ghost disabled={busy} onPress={remove} />}
  </FormPage>;
}
