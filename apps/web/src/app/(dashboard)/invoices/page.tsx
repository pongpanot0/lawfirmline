'use client';

import { InvoicePanel } from '@/components/billing/InvoicePanel';

/**
 * ใบแจ้งหนี้ที่ออกเปล่า — ยังไม่มีคดีและไม่มีเรื่องที่รับเข้ามา
 * ใช้ตอนต้องส่งตัวเลขให้ลูกค้าดูก่อนตกลงรับงาน
 */
export default function InvoicesPage() {
  return (
    <div className="mx-auto w-full max-w-3xl pb-20">
      <h1 className="mb-1 text-2xl font-bold tracking-tight">ใบแจ้งหนี้</h1>
      <p className="mb-5 text-sm text-muted-foreground">
        ใบที่ออกไว้ก่อนมีคดี — ใบที่ออกจากคดีหรือเรื่องที่รับเข้ามา ดูได้ในหน้านั้น ๆ
      </p>
      <InvoicePanel target={{}} customers={[]} />
    </div>
  );
}
