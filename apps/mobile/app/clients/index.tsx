import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { useRouter } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { useClients } from '@/api/hooks';
import { Card, EmptyNote, ErrorNote, Loading, PageIntro, SearchBox } from '@/components/ui';
import { initials } from '@/format';
import { colors, spacing, pageContent } from '@/theme';

export default function ClientsScreen() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [committed, setCommitted] = useState('');
  const clients = useClients(committed);

  return (
    <View style={styles.screen}>
      <View style={{ ...pageContent, maxWidth: 760, paddingBottom: 0 }}>
        <PageIntro title="สมุดลูกความ" detail="แตะชื่อเพื่อดูข้อมูลติดต่อและคดีของลูกความ" />
        <SearchBox value={search} onChange={setSearch} onSearch={() => setCommitted(search.trim())} onClear={() => setCommitted('')} placeholder="ค้นหาชื่อลูกความ" />
      </View>
      {clients.isLoading ? (
        <Loading />
      ) : clients.isError ? (
        <View style={{ padding: spacing.lg }}>
          <ErrorNote message="โหลดรายชื่อลูกความไม่สำเร็จ" onRetry={() => clients.refetch()} />
        </View>
      ) : (
        <FlatList
          data={clients.data ?? []}
          keyExtractor={(client) => client.id}
          contentContainerStyle={pageContent}
          refreshing={clients.isRefetching}
          onRefresh={() => clients.refetch()}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button" accessibilityLabel={`ดูข้อมูล ${item.name}`}
              onPress={() => router.push(`/clients/${item.id}`)}
              style={({ pressed }) => pressed && { opacity: 0.7 }}
            >
              <Card style={{ marginBottom: spacing.md }}>
                <View style={styles.row}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{initials(item.name)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>
                      {item.name}
                    </Text>
                    {item.type ? <Text style={styles.meta}>{item.type}</Text> : null}
                  </View>
                  <ChevronRight size={18} color={colors.faint} />
                </View>
              </Card>
            </Pressable>
          )}
          ListEmptyComponent={<EmptyNote>ไม่พบลูกความ</EmptyNote>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.soft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.ink, fontWeight: '700', fontSize: 13 },
  name: { fontSize: 15, fontWeight: '600', color: colors.text },
  meta: { fontSize: 12, color: colors.faint, marginTop: 2 },
});
