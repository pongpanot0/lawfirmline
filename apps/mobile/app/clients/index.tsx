import React, { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { useRouter } from 'expo-router';
import { ChevronRight, Contact } from 'lucide-react-native';
import { useClients } from '@/api/hooks';
import { Card, EmptyState, ErrorState, LoadingState, PageIntro, SearchBox } from '@/components/ui';
import { initials } from '@/format';
import { colors, radius, spacing, pageContent } from '@/theme';

/** Same labels as ClientPicker's CLIENT_TYPES (not exported there); unknown values pass through. */
const CLIENT_TYPE_LABEL: Record<string, string> = { INDIVIDUAL: 'บุคคลธรรมดา', COMPANY: 'นิติบุคคล' };

export default function ClientsScreen() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [committed, setCommitted] = useState('');
  // Results follow typing after a short pause; the keyboard search key still commits at once.
  useEffect(() => {
    const timer = setTimeout(() => setCommitted(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);
  const clients = useClients(committed);

  return (
    <View style={styles.screen}>
      <View style={{ ...pageContent, maxWidth: 760, paddingBottom: spacing.sm }}>
        <PageIntro title="ลูกความ" detailOnly detail="แตะชื่อเพื่อดูข้อมูลติดต่อและคดีของลูกความ" />
        <SearchBox value={search} onChange={setSearch} onSearch={() => setCommitted(search.trim())} onClear={() => setCommitted('')} placeholder="ค้นหาชื่อลูกความ" />
      </View>
      {clients.isLoading ? (
        <LoadingState label="กำลังโหลดรายชื่อลูกความ…" />
      ) : clients.isError ? (
        <View style={{ ...pageContent, maxWidth: 760 }}>
          <ErrorState message="โหลดรายชื่อลูกความไม่สำเร็จ" onRetry={() => clients.refetch()} />
        </View>
      ) : (
        <FlatList
          data={clients.data ?? []}
          keyExtractor={(client) => client.id}
          contentContainerStyle={{ ...pageContent, maxWidth: 760, paddingTop: spacing.sm }}
          keyboardShouldPersistTaps="handled"
          refreshing={clients.isRefetching}
          onRefresh={() => clients.refetch()}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button" accessibilityLabel={`ดูข้อมูล ${item.name}`}
              onPress={() => router.push(`/clients/${item.id}`)}
              style={({ pressed }) => pressed && { opacity: 0.7 }}
            >
              <Card style={styles.card}>
                <View style={styles.row}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{initials(item.name)}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.name}>{item.name}</Text>
                    {item.type ? <Text style={styles.meta}>{CLIENT_TYPE_LABEL[item.type] ?? item.type}</Text> : null}
                  </View>
                  <ChevronRight size={18} color={colors.muted} />
                </View>
              </Card>
            </Pressable>
          )}
          ListEmptyComponent={<EmptyState icon={Contact}>{committed
            ? `ไม่พบลูกความชื่อ “${committed}” · ลองคำสั้นลง`
            : 'ยังไม่มีลูกความ · เพิ่มได้บนเว็บ'}</EmptyState>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  card: { marginBottom: spacing.md, paddingVertical: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.infoSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.info, fontWeight: '700', fontSize: 14 },
  name: { fontSize: 16, fontWeight: '600', color: colors.text, lineHeight: 24 },
  meta: { fontSize: 13, lineHeight: 20, color: colors.muted },
});
