import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { useRouter } from 'expo-router';
import { hasFirmCapability } from '@lawfirm/shared';
import {
  BarChart3,
  BookOpen,
  ChevronRight,
  Clock,
  Contact,
  FileClock,
  FilePlus2,
  LogOut,
  Mail,
  PauseCircle,
  Receipt,
  CalendarOff,
  Search,
  Settings,
  UserRound,
  Trash2,
  Wallet,
} from 'lucide-react-native';
import { useAuth } from '@/api/auth';
import { Card, PageIntro, SectionLabel } from '@/components/ui';
import { colors, spacing, pageContent, radius } from '@/theme';

const ITEMS = [
  { route: '/account', Icon: UserRound, title: 'บัญชีของฉัน', detail: 'ข้อมูลส่วนตัวและรหัสผ่าน' },
  { route: '/document-waiting', Icon: FileClock, title: 'รอเอกสารจากภายนอก', detail: 'ขาดอะไร รอจากใคร ติดตามวันไหน และได้รับแล้วหรือยัง' },
  { route: '/settings', Icon: Settings, title: 'ตั้งค่า', detail: 'การแจ้งเตือน (แอป / LINE) และขนาดตัวอักษร' },
  { route: '/search', Icon: Search, title: 'ค้นหาไฟล์', detail: 'ค้นชื่อไฟล์ในทุกคดีที่เข้าถึงได้' },
  { route: '/email-search', Icon: Mail, title: 'ค้นหาอีเมล', detail: 'ค้นอีเมลจากชื่อลูกความ หัวเรื่อง หรือข้อความ ในทุกคดี' },
  { route: '/leaves', Icon: CalendarOff, title: 'ขอลา', detail: 'เลือกประเภทและวันที่ ดูสถานะคำขอ' },
  { route: '/expenses/claims', Icon: Receipt, title: 'ชุดเบิก', detail: 'รายการที่ส่งเป็นชุด และสถานะการจ่าย' },
  { route: '/clients', Icon: Contact, title: 'ลูกความ', detail: 'สมุดลูกความ โทร/อีเมล และคดีของแต่ละราย' },
  { route: '/expenses', Icon: Wallet, title: 'ค่าใช้จ่าย', detail: 'บันทึกค่าใช้จ่ายหน้างาน ถ่ายใบเสร็จ ส่งเบิก' },
  { route: '/timesheet', Icon: Clock, title: 'ยืนยันเวลา', detail: 'ยืนยันเวลาทำงานจากนัดศาล งาน อีเมล และกิจกรรมวันนี้' },
  { route: '/case/new', Icon: FilePlus2, title: 'รับเคสใหม่', detail: 'สร้างคดี เลือกคนหลัก คนรอง และแนบไฟล์' },
  { route: '/reports', Icon: BarChart3, title: 'รายงาน', detail: 'สรุปคดีที่ปิด ระยะเวลาเฉลี่ย และปริมาณงาน' },
  { route: '/knowledge', Icon: BookOpen, title: 'คลังความรู้', detail: 'ค้นหาสรุปคดี แนวคำพิพากษา บทเรียน' },
  { route: '/operations', Icon: PauseCircle, title: 'งานพักไว้', detail: 'คิวงานที่รอคนอื่น เรียงตามกำหนดติดตาม' },
] as const;

const GROUPS = [
  { title: 'งานสำนักงาน', routes: ['/case/new', '/clients', '/leaves', '/expenses', '/expenses/claims', '/timesheet', '/operations'] },
  { title: 'เอกสารและข้อมูล', routes: ['/search', '/email-search', '/document-waiting', '/reports', '/knowledge'] },
  { title: 'บัญชีและการตั้งค่า', routes: ['/account', '/settings'] },
];

export default function MoreScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const confirmLogout = () => Alert.alert('ออกจากระบบ', user?.email ? `ออกจากระบบจาก ${user.email}?` : 'ออกจากระบบจากเครื่องนี้?', [
    { text: 'ยกเลิก', style: 'cancel' }, { text: 'ออกจากระบบ', style: 'destructive', onPress: logout },
  ]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={pageContent}>
      <PageIntro title="อื่น ๆ" detailOnly detail={user?.firmName} />
      {GROUPS.map(group => <View key={group.title}>
        <SectionLabel style={{ marginTop: spacing.md }}>{group.title}</SectionLabel>
        <Card style={styles.menuCard}>
          {ITEMS.filter(item => group.routes.includes(item.route) && (item.route !== '/operations' || hasFirmCapability(user?.firmRole, 'runOperations'))).map((item, index) => (
            <View key={item.route}>
              {index > 0 ? <View style={styles.divider} /> : null}
              <Pressable
                accessibilityRole="button" accessibilityLabel={item.title} accessibilityHint={item.detail}
                onPress={() => router.push(item.route as never)}
                style={({ pressed }) => [styles.menuRow, pressed && { backgroundColor: colors.soft }]}
              >
                <View style={styles.row}>
                  <View style={styles.icon}><item.Icon size={20} color={colors.ink} /></View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.title}>{item.title}</Text>
                    <Text style={styles.detail}>{item.detail}</Text>
                  </View>
                  <ChevronRight size={18} color={colors.muted} />
                </View>
              </Pressable>
            </View>
          ))}
        </Card>
      </View>)}

      {/* Leaving and deleting sit together at the end, away from everyday tools. */}
      <Card style={[styles.menuCard, { marginTop: spacing.xl }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="ออกจากระบบ" accessibilityHint={user?.email} onPress={confirmLogout}
          style={({ pressed }) => [styles.menuRow, pressed && { backgroundColor: colors.soft }]}>
          <View style={styles.row}>
            <View style={[styles.icon, styles.iconWarn]}><LogOut size={20} color={colors.warn} /></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.title, { color: colors.warn }]}>ออกจากระบบ</Text>
              {user?.email ? <Text style={styles.detail}>{user.email}</Text> : null}
            </View>
          </View>
        </Pressable>
        <View style={styles.divider} />
        <Pressable accessibilityRole="button" accessibilityLabel="ลบบัญชีและข้อมูล" accessibilityHint="ส่งคำขอและติดตามสถานะ"
          onPress={() => router.push('/delete-account')}
          style={({ pressed }) => [styles.menuRow, pressed && { backgroundColor: colors.soft }]}>
          <View style={styles.row}>
            <View style={[styles.icon, styles.iconWarn]}><Trash2 size={20} color={colors.warn} /></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.title, { color: colors.warn }]}>ลบบัญชีและข้อมูล</Text>
              <Text style={styles.detail}>ส่งคำขอและติดตามสถานะ · ยังไม่ลบทันที</Text>
            </View>
            <ChevronRight size={18} color={colors.warn} />
          </View>
        </Pressable>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  // Rows run edge to edge inside the card so the pressed tint fills the row; the card keeps its raised shadow.
  // (No overflow:hidden: on iOS it would clip the card's shadow.)
  menuCard: { marginBottom: spacing.md, paddingVertical: 0, paddingHorizontal: 0 },
  menuRow: { minHeight: 68, justifyContent: 'center', paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  // Hairline inset to the text column, so the icon tiles read as one column.
  divider: { height: 1, backgroundColor: colors.divider, marginLeft: spacing.lg + 40 + spacing.md },
  icon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.infoSoft, alignItems: 'center', justifyContent: 'center' },
  iconWarn: { backgroundColor: colors.warnSoft },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  title: { fontSize: 16, fontWeight: '600', color: colors.text },
  detail: { fontSize: 13, lineHeight: 20, color: colors.muted, marginTop: 2 },
});
