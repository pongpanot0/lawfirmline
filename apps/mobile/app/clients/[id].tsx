import React from 'react';
import {
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Mail, Phone } from 'lucide-react-native';
import { useClient } from '@/api/hooks';
import { Card, EmptyNote, ErrorNote, Loading, SectionLabel, Tag } from '@/components/ui';
import { colors, spacing, TOUCH } from '@/theme';

function ActionButton({
  Icon,
  onPress,
}: {
  Icon: React.ComponentType<{ size?: number; color?: string }>;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.action, pressed && { opacity: 0.7 }]}
    >
      <Icon size={17} color={colors.ink} />
    </Pressable>
  );
}

export default function ClientDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const client = useClient(id);

  if (client.isLoading) return <Loading />;
  if (client.isError || !client.data)
    return (
      <View style={{ padding: spacing.lg }}>
        <ErrorNote message="โหลดข้อมูลลูกความไม่สำเร็จ" onRetry={() => client.refetch()} />
      </View>
    );

  const detail = client.data;

  return (
    <>
      <Stack.Screen options={{ title: detail.name }} />
      <ScrollView
        style={styles.screen}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl refreshing={client.isRefetching} onRefresh={() => client.refetch()} />
        }
      >
        <Text style={styles.name}>{detail.name}</Text>
        {detail.type ? <Text style={styles.type}>{detail.type}</Text> : null}

        <SectionLabel>ผู้ติดต่อ</SectionLabel>
        <Card>
          {(detail.contacts ?? []).length === 0 ? (
            <EmptyNote>ยังไม่มีผู้ติดต่อ</EmptyNote>
          ) : (
            detail.contacts!.map((contact, index) => (
              <View key={contact.id}>
                {index > 0 && <View style={styles.divider} />}
                <View style={styles.contactRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.contactName}>
                      {contact.name}
                      {contact.nickname ? ` (${contact.nickname})` : ''}
                    </Text>
                    <Text style={styles.contactMeta} numberOfLines={1}>
                      {[contact.position, contact.phone, contact.email]
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    </Text>
                  </View>
                  {contact.phone ? (
                    <ActionButton
                      Icon={Phone}
                      onPress={() => Linking.openURL(`tel:${contact.phone}`)}
                    />
                  ) : null}
                  {contact.email ? (
                    <ActionButton
                      Icon={Mail}
                      onPress={() => Linking.openURL(`mailto:${contact.email}`)}
                    />
                  ) : null}
                </View>
              </View>
            ))
          )}
        </Card>

        <SectionLabel>คดี</SectionLabel>
        <Card>
          {(detail.cases ?? []).length === 0 ? (
            <EmptyNote>ยังไม่มีคดี</EmptyNote>
          ) : (
            detail.cases!.map((caseRow, index) => (
              <View key={caseRow.id}>
                {index > 0 && <View style={styles.divider} />}
                <Pressable
                  style={({ pressed }) => [styles.caseRow, pressed && { opacity: 0.7 }]}
                  onPress={() => router.push(`/case/${caseRow.id}`)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.caseRef}>{caseRow.ownRef}</Text>
                    <Text style={styles.caseTitle} numberOfLines={2}>
                      {caseRow.title}
                    </Text>
                  </View>
                  <Tag tone={caseRow.status === 'CLOSED' ? 'ok' : 'info'}>
                    {caseRow.status === 'CLOSED' ? 'ปิดแล้ว' : 'เปิด'}
                  </Tag>
                </Pressable>
              </View>
            ))
          )}
        </Card>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  name: { fontSize: 20, fontWeight: '700', color: colors.ink },
  type: { fontSize: 13, color: colors.muted, marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.soft, marginVertical: 4 },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  contactName: { fontSize: 14, fontWeight: '600', color: colors.text },
  contactMeta: { fontSize: 12, color: colors.faint, marginTop: 2 },
  action: {
    width: TOUCH - 6,
    height: TOUCH - 6,
    borderRadius: (TOUCH - 6) / 2,
    backgroundColor: colors.soft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  caseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  caseRef: { fontSize: 13, fontWeight: '700', color: colors.ink },
  caseTitle: { fontSize: 13, color: colors.muted, marginTop: 2 },
});
