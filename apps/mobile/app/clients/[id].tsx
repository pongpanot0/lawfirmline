import React from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronRight, Mail, Phone } from 'lucide-react-native';
import { useClient } from '@/api/hooks';
import { Card, EmptyState, ErrorState, LoadingState, PageIntro, SectionLabel, Tag } from '@/components/ui';
import { initials } from '@/format';
import { colors, radius, spacing, TOUCH, pageContent, typeScale } from '@/theme';

/** Same labels as ClientPicker's CLIENT_TYPES (not exported there); unknown values pass through. */
const CLIENT_TYPE_LABEL: Record<string, string> = { INDIVIDUAL: 'บุคคลธรรมดา', COMPANY: 'นิติบุคคล' };

/** The number or address itself is the 44pt link, so it is shown once and named for screen readers. */
function ContactLink({ Icon, value, label, onPress }: {
  Icon: React.ComponentType<{ size?: number; color?: string }>; value: string; label: string; onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={label} onPress={onPress}
      style={({ pressed }) => [styles.contactLink, pressed && { opacity: 0.6 }]}>
      <Icon size={17} color={colors.info} />
      <Text style={styles.contactLinkText}>{value}</Text>
    </Pressable>
  );
}

export default function ClientDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const client = useClient(id);

  if (client.isLoading) return <LoadingState label="กำลังโหลดข้อมูลลูกความ…" />;
  if (client.isError || !client.data)
    return (
      <View style={[styles.screen, { padding: spacing.lg }]}>
        <ErrorState message="โหลดข้อมูลลูกความไม่สำเร็จ" onRetry={() => client.refetch()} />
      </View>
    );

  const detail = client.data;
  const contacts = detail.contacts ?? [];
  // Open matters first; closed ones stay below for reference.
  const cases = [...(detail.cases ?? [])].sort((a, b) => Number(a.status === 'CLOSED') - Number(b.status === 'CLOSED'));
  const typeLabel = detail.type ? CLIENT_TYPE_LABEL[detail.type] ?? detail.type : undefined;

  return (
    <>
      <Stack.Screen options={{ title: detail.name }} />
      <ScrollView
        style={styles.screen}
        contentContainerStyle={pageContent}
        refreshControl={
          <RefreshControl refreshing={client.isRefetching} onRefresh={() => client.refetch()} />
        }
      >
        <PageIntro title={detail.name} detailOnly detail={typeLabel} />

        <SectionLabel style={{ marginTop: spacing.md }}>ผู้ติดต่อ</SectionLabel>
        {contacts.length === 0 ? (
          <Card flat><EmptyState compact>ยังไม่มีผู้ติดต่อ</EmptyState></Card>
        ) : (
          <Card style={styles.listCard}>
            {contacts.map((contact, index) => (
              <View key={contact.id} style={[styles.contact, index > 0 && styles.divider]}>
                <View style={styles.avatar}><Text style={styles.avatarText}>{initials(contact.name)}</Text></View>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text style={styles.contactName}>
                    {contact.name}
                    {contact.nickname ? ` (${contact.nickname})` : ''}
                  </Text>
                  {contact.position ? <Text style={styles.contactMeta}>{contact.position}</Text> : null}
                  {contact.phone ? <ContactLink Icon={Phone} value={contact.phone} label={`โทรหา ${contact.name} ${contact.phone}`}
                    onPress={() => Linking.openURL(`tel:${contact.phone}`)} /> : null}
                  {contact.email ? <ContactLink Icon={Mail} value={contact.email} label={`อีเมลถึง ${contact.name} ${contact.email}`}
                    onPress={() => Linking.openURL(`mailto:${contact.email}`)} /> : null}
                  {!contact.phone && !contact.email ? <Text style={styles.contactMeta}>ยังไม่มีเบอร์โทรหรืออีเมล</Text> : null}
                </View>
              </View>
            ))}
          </Card>
        )}

        <SectionLabel>คดี</SectionLabel>
        {cases.length === 0 ? (
          <Card flat><EmptyState compact>ยังไม่มีคดี</EmptyState></Card>
        ) : (
          <Card style={styles.listCard}>
            {cases.map((caseRow, index) => (
              <Pressable
                key={caseRow.id}
                accessibilityRole="button"
                accessibilityLabel={`${caseRow.ownRef} ${caseRow.title} · ${caseRow.status === 'CLOSED' ? 'ปิดแล้ว' : 'เปิดอยู่'}`}
                style={({ pressed }) => [styles.caseRow, index > 0 && styles.divider, pressed && { backgroundColor: colors.soft }]}
                onPress={() => router.push(`/case/${caseRow.id}`)}
              >
                <View style={{ flex: 1, minWidth: 0, gap: spacing.xs }}>
                  <Text style={styles.caseRef}>{caseRow.ownRef}</Text>
                  <Text style={styles.caseTitle}>{caseRow.title}</Text>
                  <Tag tone={caseRow.status === 'CLOSED' ? 'ok' : 'info'}>{caseRow.status === 'CLOSED' ? 'ปิดแล้ว' : 'เปิดอยู่'}</Tag>
                </View>
                <ChevronRight size={18} color={colors.muted} />
              </Pressable>
            ))}
          </Card>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  listCard: { paddingVertical: 0 },
  divider: { borderTopWidth: 1, borderTopColor: colors.divider },
  contact: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingVertical: spacing.md },
  avatar: { width: 40, height: 40, borderRadius: radius.full, backgroundColor: colors.infoSoft, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.info, fontWeight: '700', fontSize: 14 },
  contactName: { fontSize: 16, lineHeight: 24, fontWeight: '600', color: colors.text },
  contactMeta: { fontSize: 13, lineHeight: 20, color: colors.muted },
  contactLink: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: TOUCH, alignSelf: 'flex-start' },
  contactLinkText: { fontSize: 15, color: colors.info },
  caseRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, minHeight: TOUCH },
  caseRef: { ...typeScale.overline, color: colors.ink, fontWeight: '700' },
  caseTitle: { fontSize: 15, lineHeight: 22, color: colors.text },
});
