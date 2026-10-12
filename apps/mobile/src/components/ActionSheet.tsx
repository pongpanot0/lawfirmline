import React from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/AppText';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import { colors, fonts, spacing } from '@/theme';

/** Bottom sheet shared by court-event records, review returns and other one-hand flows. */
export function ActionSheet({ visible, title, detail, onClose, children }: {
  visible: boolean;
  title: string;
  detail?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const { bottom } = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  return <Modal visible={visible} transparent animationType="slide"
    supportedOrientations={['portrait', 'portrait-upside-down', 'landscape-left', 'landscape-right']} onRequestClose={onClose}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <Pressable accessible={false} style={[styles.backdrop, { paddingBottom: keyboardHeight }]} onPress={onClose}>
        <Pressable accessible={false} style={[styles.sheet, { paddingBottom: spacing.lg + bottom }]} onPress={() => undefined}>
          <View style={styles.handle} />
          <Text accessibilityRole="header" style={styles.title}>{title}</Text>
          {detail ? <Text style={styles.detail} numberOfLines={2}>{detail}</Text> : null}
          <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: spacing.sm }}>
            {children}
          </ScrollView>
        </Pressable>
      </Pressable>
    </KeyboardAvoidingView>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(14,20,32,0.45)', justifyContent: 'flex-end' },
  sheet: {
    width: '100%', maxWidth: 760, alignSelf: 'center', maxHeight: '90%',
    backgroundColor: colors.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: spacing.lg,
  },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colors.line, marginBottom: spacing.md },
  title: { fontFamily: fonts.bold, fontSize: 17, color: colors.ink },
  detail: { color: colors.muted, fontSize: 13, marginTop: 2, marginBottom: spacing.md },
});
