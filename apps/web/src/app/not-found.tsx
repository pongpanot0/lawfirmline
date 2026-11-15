import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, LogIn } from 'lucide-react';
import { SamnuanLogo } from '@/components/brand/SamnuanLogo';
import '@/components/landing/landing-tokens.css';

export const metadata: Metadata = {
  title: 'ไม่พบหน้า | Samnuan',
};

export default function NotFound() {
  return (
    <div className="lf-landing min-h-screen">
      <div className="lf-shell flex min-h-screen flex-col py-8">
        <Link href="/" aria-label="Samnuan หน้าหลัก" className="self-start">
          <SamnuanLogo variant="horizontal" />
        </Link>
        <main className="flex flex-1 flex-col items-start justify-center py-16">
          <p className="tech-eyebrow">404</p>
          <h1 className="tech-title">ไม่พบหน้าที่คุณค้นหา</h1>
          <p className="tech-lede">ลิงก์นี้อาจเก่าแล้ว หรือหน้านี้อาจถูกย้ายไป</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/" className="lf-btn lf-btn--primary whitespace-nowrap"><ArrowLeft size={17} aria-hidden />กลับหน้าแรก</Link>
            <Link href="/login" className="lf-btn lf-btn--outline whitespace-nowrap"><LogIn size={17} aria-hidden />เข้าสู่ระบบ</Link>
          </div>
        </main>
      </div>
    </div>
  );
}
