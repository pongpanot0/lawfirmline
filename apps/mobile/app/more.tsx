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
  UserRound,
  Trash2,
} from 'lucide-react-native';
import { useAuth } from '@/api/auth';
import { Card, PageIntro, SectionLabel } from '@/components/ui';
import { colors, spacing, pageContent } from '@/theme';

const ITEMS = [
  { route: '/account', Icon: UserRound, title: 'บัญชีของฉัน', detail: 'ข้อมูลส่วนตัวและรหัสผ่าน' },
  { route: '/delete-account', Icon: Trash2, title: 'ลบบัญชีและข้อมูล', detail: 'ส่งคำขอและติดตามสถานะ' },
  { route: '/document-waiting', Icon: FilePlus2, title: 'รอเอกสารจากภายนอก', detail: 'ขาดอะไร รอจากใคร ติดตามวันไหน และได้รับแล้วหรือยัง' },
  { route: '/settings', Icon: Settings, title: 'ตั้งค่า', detail: 'การแจ้งเตือน (แอป / LINE) และขนาดตัวอักษร' },
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
  const groups = [
    { title: 'บัญชีและการตั้งค่า', routes: ['/account', '/delete-account', '/settings'] },
    { title: 'งานสำนักงาน', routes: ['/case/new', '/clients', '/leaves', '/expenses', '/expenses/claims', '/operations'] },
    { title: 'เอกสารและข้อมูล', routes: ['/search', '/document-waiting', '/reports', '/knowledge'] },
  ];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={pageContent}>
      <PageIntro title="เครื่องมือและบัญชี" detail={user?.firmName} />
      {groups.map(group => <View key={group.title}>
      <SectionLabel style={{ marginTop: spacing.sm }}>{group.title}</SectionLabel>
      <Card style={{ marginBottom: spacing.md }}>
      {ITEMS.filter(item => group.routes.includes(item.route) && (item.route !== '/operations' || user?.firmRole === 'OWNER')).map((item, index) => (
        <Pressable
          accessibilityRole="button" accessibilityLabel={item.title}
          key={item.route}
          onPress={() => router.push(item.route as never)}
          style={({ pressed }) => [styles.menuRow, index > 0 && { borderTopWidth: 1, borderTopColor: colors.line }, pressed && { backgroundColor: colors.soft }]}
        >
            <View style={styles.row}>
              <View style={styles.icon}><item.Icon size={20} color={colors.ink} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{item.title}</Text>
                <Text style={styles.detail}>{item.detail}</Text>
              </View>
              <ChevronRight size={18} color={colors.faint} />
            </View>
        </Pressable>
      ))}
      </Card></View>)}

      <Pressable accessibilityRole="button" accessibilityLabel="ออกจากระบบ" onPress={logout} style={({ pressed }) => pressed && { opacity: 0.7 }}>
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
  menuRow: { minHeight: 68, justifyContent: 'center', paddingVertical: spacing.md },
  icon: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  title: { fontSize: 15, fontWeight: '600', color: colors.text },
  detail: { fontSize: 12, color: colors.faint, marginTop: 2 },
});
