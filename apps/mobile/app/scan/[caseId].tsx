import React, { useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { PDFDocument } from 'pdf-lib';
import { Camera, Trash2 } from 'lucide-react-native';
import { useQueryClient } from '@tanstack/react-query';
import { uploadCaseDocument } from '@/api/files';
import { Button, Card, EmptyNote, SectionLabel } from '@/components/ui';
import { colors, radius, spacing } from '@/theme';

/**
 * Court-hallway scanner: photograph pages one after another, then merge into
 * a single PDF and upload straight into the case's documents. JPEG quality
 * 0.5 keeps a 10-page bundle around a few MB on court Wi-Fi.
 */
export default function ScanScreen() {
  const { caseId } = useLocalSearchParams<{ caseId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [pages, setPages] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const takePage = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('ต้องอนุญาตกล้อง', 'เปิดสิทธิ์กล้องใน Settings เพื่อสแกนเอกสาร');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.5 });
    if (!result.canceled && result.assets[0]) {
      setPages((current) => [...current, result.assets[0].uri]);
    }
  };

  const upload = async () => {
    if (pages.length === 0) return;
    setBusy(true);
    try {
      const pdf = await PDFDocument.create();
      for (const uri of pages) {
        const base64 = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const jpg = await pdf.embedJpg(base64);
        const page = pdf.addPage([jpg.width, jpg.height]);
        page.drawImage(jpg, { x: 0, y: 0, width: jpg.width, height: jpg.height });
      }
      const pdfBase64 = await pdf.saveAsBase64();
      const filename = `${name.trim() || `สแกน-${new Date().toISOString().slice(0, 10)}`}.pdf`;
      const target = `${FileSystem.cacheDirectory}scan-${Date.now()}.pdf`;
      await FileSystem.writeAsStringAsync(target, pdfBase64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      await uploadCaseDocument(caseId, target, filename, 'application/pdf');
      queryClient.invalidateQueries({ queryKey: ['case-documents', caseId] });
      Alert.alert('อัปโหลดแล้ว', `${filename} (${pages.length} หน้า) เข้าเอกสารคดีเรียบร้อย`, [
        { text: 'ตกลง', onPress: () => router.back() },
      ]);
    } catch (error) {
      Alert.alert(
        'อัปโหลดไม่สำเร็จ',
        error instanceof Error ? error.message : 'ตรวจสอบการเชื่อมต่อแล้วลองใหม่',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: 'สแกนเอกสาร' }} />
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
          <TextInput
            style={styles.nameInput}
            placeholder="ชื่อเอกสาร เช่น รายงานกระบวนพิจารณา"
            placeholderTextColor={colors.faint}
            value={name}
            onChangeText={setName}
          />
          <SectionLabel>หน้า ({pages.length})</SectionLabel>
          {pages.length === 0 ? (
            <Card>
              <EmptyNote>ยังไม่มีหน้า — กด "ถ่ายหน้าแรก" ด้านล่าง</EmptyNote>
            </Card>
          ) : (
            <View style={styles.grid}>
              {pages.map((uri, index) => (
                <View key={uri} style={styles.thumbWrap}>
                  <Image source={{ uri }} style={styles.thumb} />
                  <Text style={styles.thumbIndex}>{index + 1}</Text>
                  <Pressable
                    hitSlop={8}
                    style={styles.thumbRemove}
                    onPress={() =>
                      setPages((current) => current.filter((page) => page !== uri))
                    }
                  >
                    <Trash2 size={13} color="#fff" />
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
        <View style={styles.footer}>
          <Pressable
            onPress={takePage}
            disabled={busy}
            style={({ pressed }) => [styles.cameraButton, pressed && { opacity: 0.8 }]}
          >
            <Camera size={18} color={colors.ink} />
            <Text style={styles.cameraText}>
              {pages.length === 0 ? 'ถ่ายหน้าแรก' : 'ถ่ายหน้าถัดไป'}
            </Text>
          </Pressable>
          <Button
            title={`รวมเป็น PDF แล้วอัปโหลด (${pages.length})`}
            onPress={upload}
            disabled={pages.length === 0}
            busy={busy}
          />
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  nameInput: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.button,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  thumbWrap: { width: '31%', aspectRatio: 3 / 4 },
  thumb: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
    backgroundColor: colors.soft,
  },
  thumbIndex: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 3,
  },
  thumbRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(179,64,46,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    padding: spacing.lg,
    paddingBottom: 28,
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  cameraButton: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.soft,
    borderRadius: radius.button,
    paddingVertical: 13,
    minHeight: 48,
  },
  cameraText: { fontWeight: '600', color: colors.ink, fontSize: 15 },
});
