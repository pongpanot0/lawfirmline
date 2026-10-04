import React, { useCallback } from 'react';
import { RefreshControl, ScrollView } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { canAssignFirmRole, FirmRole } from '@lawfirm/shared';
import { useAuth } from '@/api/auth';
import { usePersonWorkload } from '@/api/hooks';
import { PersonWorkloadView } from '@/components/PersonWorkloadView';
import { EmptyNote, ErrorNote, Loading } from '@/components/ui';
import { bangkokDay } from '@/format';
import { colors, pageContent } from '@/theme';

export default function PersonScreen() {
  const { id, from } = useLocalSearchParams<{ id?: string; from?: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const start = from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : bangkokDay(new Date().toISOString());
  const person = usePersonWorkload(id ?? '', start);
  useFocusEffect(useCallback(() => { if (id) void person.refetch(); }, [id, start, person.refetch]));
  const data = person.data;
  const canAssign = user?.firmRole === FirmRole.OWNER && data && canAssignFirmRole(FirmRole.OWNER, data.role as FirmRole);
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={pageContent}
      refreshControl={<RefreshControl refreshing={person.isRefetching} tintColor={colors.ink} onRefresh={() => person.refetch()} />}>
      <Stack.Screen options={{ title: 'รายละเอียดสมาชิก' }} />
      {!id ? <EmptyNote>ไม่พบสมาชิก · กลับไปเลือกรายชื่อในหน้าทีม</EmptyNote> : person.isLoading ? <Loading /> : null}
      {person.isError && <ErrorNote message="โหลดรายละเอียดสมาชิกไม่ได้ ตรวจการเชื่อมต่อแล้วลองใหม่ หรือกลับไปเลือกรายชื่อในหน้าทีม" onRetry={() => person.refetch()} />}
      {data && <PersonWorkloadView person={data} from={start} viewerId={user?.id ?? ''} owner={user?.firmRole === FirmRole.OWNER}
        onTask={taskId => router.push({ pathname: '/task/new', params: { id: taskId } })}
        onCase={caseId => router.push({ pathname: '/case/[id]', params: { id: caseId } })}
        onEvent={eventId => router.push({ pathname: '/event/[id]/team', params: { id: eventId } })}
        onAssign={canAssign ? () => router.push({ pathname: '/task/new', params: { assigneeId: data.userId } }) : undefined} />}
    </ScrollView>
  );
}
