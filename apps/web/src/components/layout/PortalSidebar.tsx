import { Home, Briefcase, Send, BarChart3, Settings } from 'lucide-react';

export const PORTAL_NAV_ITEMS = [
  { href: '/portal', label: 'ภาพรวม', icon: Home },
  { href: '/portal/operations', label: 'คดีของฉัน', icon: Briefcase },
  { href: '/portal/intake', label: 'ส่งเรื่อง', icon: Send },
  { href: '/portal/reports', label: 'รายงาน', icon: BarChart3 },
  { href: '/portal/settings', label: 'ตั้งค่า', icon: Settings },
] as const;
