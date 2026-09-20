import type { TourStep } from './types';

export const DASHBOARD_TOUR_STORAGE_KEY = 'samnuan-tour-dashboard-v1';

export const dashboardTourSteps: TourStep[] = [
  {
    selector: 'aside nav',
    title: 'เมนูหลัก',
    body: 'ใช้สลับไปหน้าต่าง ๆ ของระบบ เช่น คดี ลูกค้า ตารางศาล เอกสาร และรายงาน',
    placement: 'right',
  },
  {
    selector: 'input[placeholder*="ค้นหาคดี"]',
    title: 'ค้นหาด่วน',
    body: 'พิมพ์ชื่อคดีหรือลูกค้าตรงนี้เพื่อค้นหาได้ทันที',
    placement: 'bottom',
  },
  {
    selector: 'button[aria-haspopup="menu"]',
    title: 'สร้างใหม่',
    body: 'กดปุ่มนี้จากหน้าไหนก็ได้ เพื่อสร้างคดี งาน ลูกค้า หรือนัดหมายใหม่อย่างรวดเร็ว',
    placement: 'left',
  },
  {
    selector: '[data-tour="new-intake"]',
    title: 'รับงานใหม่',
    body: 'เริ่มต้นที่นี่เมื่อลูกค้าติดต่อเข้ามา บันทึกเรื่องไว้ก่อน แล้วค่อยตัดสินใจเปิดเป็นคดีทีหลังได้',
    placement: 'bottom',
  },
  {
    selector: '[data-tour="kpi-cases"]',
    title: 'สรุปคดี',
    body: 'การ์ดนี้บอกจำนวนคดีที่ยังไม่ปิดของสำนักงาน กดเพื่อดูรายการคดีทั้งหมด',
    placement: 'bottom',
  },
  {
    selector: '[data-tour="settings-link"]',
    title: 'ตั้งค่าและ LINE',
    body: 'แก้ไขโปรไฟล์ สลับธีม และเชื่อมต่อ LINE ส่วนตัวเพื่อรับแจ้งเตือนนัดหมายได้ที่นี่',
    placement: 'left',
  },
];
