import React, { useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Search } from 'lucide-react-native';
import { useClients } from '@/api/hooks';
import { Card, EmptyNote, ErrorNote, Loading } from '@/components/ui';
import { initials } from '@/format';
import { colors, radius, spacing } from '@/theme';

export default function ClientsScreen() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [committed, setCommitted] = useState('');
  const clients = useClients(committed);

  return (
    <View style={styles.screen}>
      <View style={styles.searchBox}>
        <Search size={16} color={colors.faint} />
        <TextInput
          style={styles.searchInput}
          placeholder="ค้นหาชื่อลูกความ"
          placeholderTextColor={colors.faint}
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={() => setCommitted(search.trim())}
          returnKeyType="search"
        />
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
          contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.sm }}
          refreshing={clients.isRefetching}
          onRefresh={() => clients.refetch()}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/clients/${item.id}`)}
              style={({ pressed }) => pressed && { opacity: 0.7 }}
            >
              <Card style={{ marginBottom: spacing.sm }}>
                <View style={styles.row}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{initials(item.name)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name} numberOfLines={1}>
                      {item.name}
                    </Text>
                    {item.type ? <Text style={styles.meta}>{item.type}</Text> : null}
                  </View>
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
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.button,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 15, color: colors.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.accentSoft, fontWeight: '700', fontSize: 13 },
  name: { fontSize: 15, fontWeight: '600', color: colors.text },
  meta: { fontSize: 12, color: colors.faint, marginTop: 2 },
});
