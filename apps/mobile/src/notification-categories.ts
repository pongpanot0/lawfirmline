import type React from 'react';
import { Briefcase, CalendarClock, ClipboardList, Mail, MessageSquare, Plane, UserRound, Wallet } from 'lucide-react-native';
import type { NotificationCategory } from './api/types';

/** Inbox icon and the label a user mutes by, per notification category. */
export const CATEGORY_META: Record<NotificationCategory, { label: string; Icon: React.ComponentType<{ size?: number; color?: string }> }> = {
  TASK: { label: 'งาน', Icon: ClipboardList },
  CASE: { label: 'คดี / เรื่องรับใหม่', Icon: Briefcase },
  COMMENT: { label: 'ความเห็น / กล่าวถึง', Icon: MessageSquare },
  CALENDAR: { label: 'นัดหมาย / นัดศาล', Icon: CalendarClock },
  CLIENT: { label: 'ลูกความ', Icon: UserRound },
  BILLING: { label: 'เบิกจ่าย / การเงิน', Icon: Wallet },
  DAILY_BRIEF: { label: 'สรุปประจำวัน', Icon: ClipboardList },
  LEAVE: { label: 'การลา', Icon: Plane },
  EMAIL: { label: 'อีเมลเข้าคดี', Icon: Mail },
};
