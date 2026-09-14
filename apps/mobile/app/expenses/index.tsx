import React from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Plus } from 'lucide-react-native';
import { useAuth } from '@/api/auth';
import { useExpenses, useSubmitExpenses } from '@/api/hooks';
import { Button, Card, EmptyNote, ErrorNote, Loading, Tag, TagTone } from '@/components/ui';
import { thDate } from '@/format';
import { colors, spacing } from '@/theme';

const STATUS_META: Record<string, { label: string; tone: TagTone }> = {
  DRAFT: { label: 'ยังไม่ส่งเบิก', tone: 'plain' },
  PENDING: { label: 'รอตรวจ', tone: 'info' },
  APPROVED: { label: 'อนุมัติ', tone: 'ok' },
  PAID: { label: 'จ่ายแล้ว', tone: 'ok' },
  REJECTED: { label: 'ตีกลับ', tone: 'due' },
};

export default function ExpensesScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const expenses = useExpenses();
  const submit = useSubmitExpenses();
  const insets = useSafeAreaInsets();

  if (expenses.isLoading) return <Loading />;

  const mine = (expenses.data ?? []).filter(
    (expense) => !expense.user || expense.user.id === user?.id,
  );
  const drafts = mine.filter((expense) => expense.status === 'DRAFT');

  const submitDrafts = () => {
    Alert.alert(
      'ส่งเบิก',
      `ส่งค่าใช้จ่าย ${drafts.length} รายการ รวม ${drafts
        .reduce((sum, expense) => sum + expense.amount, 0)
        .toLocaleString('th-TH')} บาท เพื่อขออนุมัติ?`,
      [
        { text: 'ยกเลิก', style: 'cancel' },
        {
          text: 'ส่งเบิก',
          onPress: () => submit.mutate(drafts.map((expense) => expense.id)),
        },
      ],
    );
  };

  return (
    <View style={styles.screen}>
      {expenses.isError ? (
        <View style={{ padding: spacing.lg }}>
          <ErrorNote message="โหลดค่าใช้จ่ายไม่สำเร็จ" onRetry={() => expenses.refetch()} />
        </View>
      ) : (
        <FlatList
          data={mine}
          keyExtractor={(expense) => expense.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 140 }}
          refreshing={expenses.isRefetching}
          onRefresh={() => expenses.refetch()}
          renderItem={({ item }) => {
            const status = STATUS_META[item.status] ?? {
              label: item.status,
              tone: 'plain' as TagTone,
            };
            return (
              <Card style={{ marginBottom: spacing.sm }}>
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.description} numberOfLines={2}>
                      {item.description}
                    </Text>
                    <Text style={styles.meta} numberOfLines={1}>
                      {[thDate(item.date), item.category, item.case?.ownRef]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </View>
                  <Text style={styles.amount}>
                    {item.amount.toLocaleString('th-TH')} ฿
                  </Text>
                  <Tag tone={status.tone}>{status.label}</Tag>
                </View>
              </Card>
            );
          }}
          ListEmptyComponent={<EmptyNote>ยังไม่มีค่าใช้จ่าย</EmptyNote>}
        />
      )}

      <View style={[styles.footer, { paddingBottom: spacing.md + insets.bottom }]}>
        {drafts.length > 0 ? (
          <Button
            title={`ส่งเบิก ${drafts.length} รายการ`}
            onPress={submitDrafts}
            busy={submit.isPending}
          />
        ) : null}
        <Pressable
          onPress={() => router.push('/expenses/new')}
          style={({ pressed }) => [styles.newButton, pressed && { opacity: 0.8 }]}
        >
          <Plus size={18} color={colors.ink} />
          <Text style={styles.newText}>บันทึกค่าใช้จ่ายใหม่</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  description: { fontSize: 14, fontWeight: '600', color: colors.text },
  meta: { fontSize: 12, color: colors.faint, marginTop: 2 },
  amount: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink,
    fontVariant: ['tabular-nums'],
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.lg,
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  newButton: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.soft,
    borderRadius: 10,
    paddingVertical: 13,
    minHeight: 48,
  },
  newText: { fontWeight: '600', color: colors.ink, fontSize: 15 },
});
