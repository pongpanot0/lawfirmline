import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { useRouter } from 'expo-router';
import {
  BarChart3,
  BookOpen,
  ChevronRight,
  Contact,
  FilePlus2,
  LogOut,
  PauseCircle,
  Receipt,
  CalendarOff,
  Search,
  Settings,
} from 'lucide-react-native';
import { useAuth } from '@/api/auth';
import { Card } from '@/components/ui';
import { colors, spacing, pageContent } from '@/theme';

const ITEMS = [
  { route: '/settings', Icon: Settings, title: 'ตั้งค่า', detail: 'ปรับขนาดตัวอักษรให้มองเห็นง่าย' },
  { route: '/search', Icon: Search, title: 'ค้นหาไฟล์', detail: 'ค้นชื่อไฟล์ในทุกคดีที่เข้าถึงได้' },
  { route: '/leaves', Icon: CalendarOff, title: 'ขอลา', detail: 'เลือกประเภทและวันที่ ดูสถานะคำขอ' },
  { route: '/expenses/claims', Icon: Receipt, title: 'ชุดเบิก', detail: 'รายการที่ส่งเป็นชุด และสถานะการจ่าย' },
  {
    route: '/clients',
    Icon: Contact,
    title: 'ลูกความ',
    detail: 'สมุดลูกความ โทร/อีเมล และคดีของแต่ละราย',
  },
  {
    route: '/expenses',
    Icon: Receipt,
    title: 'ค่าใช้จ่าย',
    detail: 'บันทึกค่าใช้จ่ายหน้างาน ถ่ายใบเสร็จ ส่งเบิก',
  },
  {
    route: '/case/new',
    Icon: FilePlus2,
    title: 'รับเคสใหม่',
    detail: 'สร้างคดี เลือกคนหลัก คนรอง และแนบไฟล์',
  },
  {
    route: '/reports',
    Icon: BarChart3,
    title: 'รายงาน',
    detail: 'สรุปตัวเลขสำคัญ: ปิดคดี อัตราสำเร็จ ปริมาณงาน',
  },
  {
    route: '/knowledge',
    Icon: BookOpen,
    title: 'คลังความรู้',
    detail: 'ค้นหาสรุปคดี แนวคำพิพากษา บทเรียน',
  },
  {
    route: '/operations',
    Icon: PauseCircle,
    title: 'งานพักไว้ (Owner)',
    detail: 'คิวงานที่รอคนอื่น เรียงตามกำหนดติดตาม',
  },
] as const;

export default function MoreScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();

  return (
    <ScrollView style={styles.screen} contentContainerStyle={pageContent}>
      {ITEMS.filter((item) => item.route !== '/operations' || user?.firmRole === 'OWNER').map((item) => (
        <Pressable
          key={item.route}
          onPress={() => router.push(item.route as never)}
          style={({ pressed }) => pressed && { opacity: 0.7 }}
        >
          <Card style={{ marginBottom: spacing.md }}>
            <View style={styles.row}>
              <item.Icon size={20} color={colors.accentInk} />
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{item.title}</Text>
                <Text style={styles.detail}>{item.detail}</Text>
              </View>
              <ChevronRight size={18} color={colors.faint} />
            </View>
          </Card>
        </Pressable>
      ))}

      <Pressable onPress={logout} style={({ pressed }) => pressed && { opacity: 0.7 }}>
        <Card style={{ marginTop: spacing.lg, borderColor: colors.warnSoft }}>
          <View style={styles.row}>
            <LogOut size={20} color={colors.warn} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: colors.warn }]}>ออกจากระบบ</Text>
              <Text style={styles.detail}>
                {user?.email ?? ''}
              </Text>
            </View>
          </View>
        </Card>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  title: { fontSize: 15, fontWeight: '600', color: colors.text },
  detail: { fontSize: 12, color: colors.faint, marginTop: 2 },
});
